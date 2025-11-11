# /home/user/yolo8_sort_dualcam.py
#!/usr/bin/env python3
from picamera2 import Picamera2
from ultralytics import YOLO
import cv2, time, os, math, numpy as np, threading
from scipy.optimize import linear_sum_assignment

# ====== 진동 모듈 ======
import RPi.GPIO as GPIO

class Vibrator:
    def __init__(self, ia=17, ib=18, freq=100, duty_on=70, pulse_ms=200, cooldown=0.5):
        self.IA, self.IB = ia, ib
        self.freq = freq
        self.duty_on = duty_on
        self.pulse_ms = pulse_ms
        self.cooldown = cooldown
        self._lock = threading.Lock()
        self._last_pulse = 0.0
        self._last_state = {}  # key -> last approaching(bool)

        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.IA, GPIO.OUT)
        GPIO.setup(self.IB, GPIO.OUT)
        GPIO.output(self.IB, GPIO.LOW)  # 항상 LOW
        self._pwm = GPIO.PWM(self.IA, self.freq)
        self._pwm.start(0)  # 기본 OFF

    def pulse(self):
        now = time.monotonic()
        with self._lock:
            # 과도한 연속 펄스 방지
            if now - self._last_pulse < self.cooldown:
                return
            self._last_pulse = now
            # ON → 대기 → OFF
            self._pwm.ChangeDutyCycle(self.duty_on)
        time.sleep(self.pulse_ms / 1000.0)
        with self._lock:
            self._pwm.ChangeDutyCycle(0)

    def update_edge(self, key: str, is_approach: bool):
        """False→True로 바뀌는 '순간'에만 pulse() 실행"""
        prev = self._last_state.get(key, False)
        if (not prev) and is_approach:
            self.pulse()
        self._last_state[key] = is_approach

    def cleanup(self):
        with self._lock:
            try:
                self._pwm.ChangeDutyCycle(0)
                self._pwm.stop()
            finally:
                GPIO.cleanup()

# =============== 공통 설정 ===============
IMG_SIZE = (320, 240)        # 12FPS 목표면 320x240 권장
CONF, IOU_TH = 0.30, 0.30
INFER_EVERY = 1
SAVE_ROOT = "/home/user/live_frames"
SAVE_INTERVAL = 0.4          # 두 카메라 합쳐 부하 고려
ALPHA_EMA = 0.3
APPROACH_DA_THR = 0.008      # 면적 증가율 임계값(초당)
MAX_AGE = 10
# 허용 클래스 (COCO): person=0, car=2, cup=41
ALLOWED_NAME = {"person", "car", "cup"}
ALLOWED_ID   = {0, 2, 41}

# 카메라 인덱스 매핑 (DISP0/1이 아닌 CAM0/1에 해당)
CAM_IDX = {"cam0": 0, "cam1": 1}
# ========================================

# --------- SORT 유틸 ---------
def xyxy_to_cxsysr(b):
    x1,y1,x2,y2 = b; w=max(1.0,x2-x1); h=max(1.0,y2-y1)
    return np.array([x1+w/2, y1+h/2, w*h, w/h], dtype=np.float32)

def cxsysr_to_xyxy(x):
    cx,cy,s,r = x[:4]; r=max(1e-3,float(r)); s=max(1e-3,float(s))
    w=math.sqrt(s*r); h=s/w
    return np.array([cx-w/2, cy-h/2, cx+w/2, cy+h/2], dtype=np.float32)

def iou_xyxy(a, b):
    ax1,ay1,ax2,ay2 = a; bx1,by1,bx2,by2 = b
    ix1,iy1=max(ax1,bx1),max(ay1,by1); ix2,iy2=min(ax2,bx2),min(ay2,by2)
    iw,ih=max(0.0,ix2-ix1),max(0.0,iy2-iy1); inter=iw*ih
    if inter<=0: return 0.0
    area_a = max(0.0, (ax2-ax1)*(ay2-ay1))
    area_b = max(0.0, (bx2-bx1)*(by2-by1))
    return inter / (area_a + area_b - inter + 1e-6)

class KalmanBox:
    def __init__(self, z):
        self.x=np.zeros((7,1),dtype=np.float32); self.x[:4,0]=z
        self.P=np.eye(7,dtype=np.float32)*10.0; self.P[4:,4:]*=1000.0
        self.Q_base=np.diag([1,1,10,1e-3, 10,10,50]).astype(np.float32)
        self.R=np.diag([1,1,10,1e-3]).astype(np.float32)
    def predict(self, dt):
        F=np.eye(7,dtype=np.float32); F[0,4]=dt; F[1,5]=dt; F[2,6]=dt
        self.x=F@self.x; self.P=F@self.P@F.T + self.Q_base*max(1.0,dt); return self.x.copy()
    def update(self, z):
        H=np.zeros((4,7),dtype=np.float32); H[0,0]=H[1,1]=H[2,2]=H[3,3]=1
        y=z.reshape(4,1) - H@self.x; S=H@self.P@H.T + self.R
        K=self.P@H.T@np.linalg.inv(S); self.x=self.x+K@y
        I=np.eye(7,dtype=np.float32); self.P=(I-K@H)@self.P

class Track:
    _next_id=1
    def __init__(self, det, cls_id, frame_area):
        self.id=Track._next_id; Track._next_id+=1
        self.kf=KalmanBox(xyxy_to_cxsysr(det))
        self.cls=int(cls_id) if cls_id is not None else -1
        self.hits=1; self.age=0; self.time_since_update=0
        self.last_ema=0.0; self.area_ema=0.0; self.frame_area=frame_area
        self.approaching=False; self.last_t=time.monotonic()
    def predict(self):
        now=time.monotonic(); dt=now-self.last_t; self.last_t=now
        self.kf.predict(max(1e-3,dt)); self.age+=1; self.time_since_update+=1
        return cxsysr_to_xyxy(self.kf.x.squeeze())
    def update(self, det_xyxy, cls_id):
        self.kf.update(xyxy_to_cxsysr(det_xyxy))
        if cls_id is not None: self.cls=int(cls_id)
        self.hits+=1; self.time_since_update=0
    def bbox(self): return cxsysr_to_xyxy(self.kf.x.squeeze())
    def update_area_ema(self, W,H,dt):
        x1,y1,x2,y2=self.bbox(); w=max(1.0,x2-x1); h=max(1.0,y2-y1)
        a=(w*h)/(W*H)
        self.area_ema = (1-ALPHA_EMA)*self.area_ema + ALPHA_EMA*a if self.hits>1 else a
        da_dt=(self.area_ema - self.last_ema)/max(dt,1e-3)
        self.approaching = da_dt>APPROACH_DA_THR
        self.last_ema=self.area_ema
        return a, da_dt

class SortTracker:
    def __init__(self, iou_th=0.3, max_age=10): self.iou_th=iou_th; self.max_age=max_age; self.tracks=[]
    def step(self, dets_xyxy, dets_cls, shape, dt=1/30.0):
        H,W=shape[:2]; preds=[t.predict() for t in self.tracks]
        M,N=len(preds),len(dets_xyxy)
        if M>0 and N>0:
            C=np.zeros((M,N),np.float32)
            for i in range(M):
                for j in range(N): C[i,j]=1.0 - iou_xyxy(preds[i], dets_xyxy[j])
            ri,cj=linear_sum_assignment(C)
            matched=[]; ut=set(range(M)); ud=set(range(N))
            for i,j in zip(ri,cj):
                if 1.0 - C[i,j] >= self.iou_th: matched.append((i,j)); ut.discard(i); ud.discard(j)
            unmatched_t=list(ut); unmatched_d=list(ud)
        else:
            matched=[]; unmatched_t=list(range(M)); unmatched_d=list(range(N))
        for i,j in matched: self.tracks[i].update(dets_xyxy[j], dets_cls[j])
        for j in unmatched_d: self.tracks.append(Track(dets_xyxy[j], dets_cls[j], W*H))
        alive=[]
        for i,t in enumerate(self.tracks):
            if i in unmatched_t: t.time_since_update += 1
            if t.time_since_update <= self.max_age: alive.append(t)
        self.tracks=alive
        out=[]
        for t in self.tracks:
            a,da_dt=t.update_area_ema(W,H,dt)
            x1,y1,x2,y2=t.bbox()
            out.append({"id":t.id,"cls":t.cls,"xyxy":(float(x1),float(y1),float(x2),float(y2)),
                        "area":float(a),"darea_dt":float(da_dt),"approaching":bool(t.approaching)})
        return out
# -------------------------------

def camera_worker(cam_name, cam_index, model, predict_lock, allowed_ids, stop_evt, vibrator: Vibrator):
    save_dir = os.path.join(SAVE_ROOT, cam_name)
    os.makedirs(save_dir, exist_ok=True)

    cam = Picamera2(camera_num=cam_index)
    cam.configure(cam.create_video_configuration(main={"size": IMG_SIZE, "format": "RGB888"}))
    cam.start(); time.sleep(0.2)

    tracker=SortTracker(iou_th=IOU_TH, max_age=MAX_AGE)
    last_save=0.0; fid=0
    names = model.model.names if hasattr(model.model,'names') else None

    print(f"[{cam_name}] 시작(camera_num={cam_index}). 저장: {save_dir}")
    try:
        prev_t = time.monotonic()
        while not stop_evt.is_set():
            frame=cam.capture_array()  # RGB
            dets_xyxy=[]; dets_cls=[]
            do_infer = (fid % INFER_EVERY == 0)

            if do_infer:
                with predict_lock:  # 모델 공유 → 예측 직렬화
                    r=model.predict(frame, imgsz=max(IMG_SIZE), conf=CONF, iou=0.45, verbose=False)
                b=r[0].boxes
                if b is not None and b.xyxy.numel() > 0:
                    xyxy=b.xyxy.cpu().numpy().astype(np.float32)
                    cls=b.cls.cpu().numpy().astype(np.int32)
                    mask = np.array([c in allowed_ids for c in cls], dtype=bool)
                    dets_xyxy = xyxy[mask]; dets_cls = cls[mask]
                else:
                    dets_xyxy=np.zeros((0,4),np.float32); dets_cls=np.zeros((0,),np.int32)

            now_t = time.monotonic()
            dt = max(1e-3, now_t - prev_t); prev_t = now_t
            tracks=tracker.step(dets_xyxy, dets_cls, frame.shape, dt=dt)

            vis=cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            for t in tracks:
                x1,y1,x2,y2=map(int,t["xyxy"])
                color=(0,255,0) if not t["approaching"] else (0,0,255)
                cv2.rectangle(vis,(x1,y1),(x2,y2),color,2)
                label=f'{cam_name}-ID{t["id"]}'
                if names:
                    cname = names[t["cls"]] if isinstance(names, dict) else names[t["cls"]]
                    label += f' {cname}'
                label += f' a={t["area"]:.3f}'
                if t["approaching"]:
                    label += " APPROACH"
                    print(f"[{cam_name}] APPROACH id={t['id']} class={cname if names else t['cls']} "
                          f"area={t['area']:.3f} dA/dt={t['darea_dt']:.4f}")
                cv2.putText(vis,label,(x1,max(0,y1-5)),cv2.FONT_HERSHEY_SIMPLEX,0.45,color,1,cv2.LINE_AA)

                # ===== 엣지 트리거 진동: False→True 순간에만 1회 펄스 =====
                vibrator.update_edge(f"{cam_name}-{t['id']}", t["approaching"])

            now=time.time()
            if now-last_save>SAVE_INTERVAL:
                ts=time.strftime("%Y%m%d-%H%M%S"); path=f"{save_dir}/{ts}-{fid:06d}.jpg"
                ok = cv2.imwrite(path, vis)
                cv2.imwrite(f"/dev/shm/{cam_name}.jpg", vis)  # 카메라별 썸네일
                print(f"[{cam_name}] saved({ok}): {path}")
                last_save=now

            if do_infer:
                n_app=sum(1 for t in tracks if t["approaching"])
                print(f"[{cam_name}][{fid}] det={len(dets_xyxy)} tracks={len(tracks)} approaching={n_app}")
            fid+=1
    finally:
        cam.stop(); print(f"[{cam_name}] 정지.")

def main():
    os.makedirs(SAVE_ROOT, exist_ok=True)
    model=YOLO("/home/user/yolov8n.pt")   # 모델 1개 로드 → 공유
    names = model.model.names if hasattr(model.model,'names') else None

    # 허용 클래스 ID 자동 매핑 (실패 시 COCO 인덱스 사용)
    allowed_ids=set()
    if names:
        inv = {str(v).lower(): k for k,v in names.items()} if isinstance(names, dict) else {v.lower(): i for i,v in enumerate(names)}
        for n in ALLOWED_NAME:
            if n in inv: allowed_ids.add(inv[n])
    if not allowed_ids: allowed_ids = ALLOWED_ID

    predict_lock = threading.Lock()
    stop_evt = threading.Event()

    vibrator = Vibrator(ia=17, ib=18, freq=100, duty_on=70, pulse_ms=200, cooldown=0.5)

    t0 = threading.Thread(target=camera_worker, args=("cam0", CAM_IDX["cam0"], model, predict_lock, allowed_ids, stop_evt, vibrator), daemon=True)
    t1 = threading.Thread(target=camera_worker, args=("cam1", CAM_IDX["cam1"], model, predict_lock, allowed_ids, stop_evt, vibrator), daemon=True)
    t0.start(); t1.start()
    print(f"[MAIN] 두 카메라 시작. 허용 클래스: {sorted(list(allowed_ids))}. Ctrl+C 종료")

    try:
        while t0.is_alive() and t1.is_alive():
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[MAIN] 종료 요청")
    finally:
        stop_evt.set(); t0.join(timeout=2.0); t1.join(timeout=2.0)
        vibrator.cleanup()
        print("[MAIN] 종료 완료.")

if __name__=="__main__":
    main()