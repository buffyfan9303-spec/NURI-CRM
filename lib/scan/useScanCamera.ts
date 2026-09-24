"use client";

/**
 * 카메라 스트림 + 디코더 루프를 하나로 묶는 훅.
 *
 * 정리(cleanup)가 핵심이다 — 스캐너 종료·화면 전환·로그아웃·사업장 전환 시
 * 모든 MediaStreamTrack과 감지 루프를 반드시 멈춘다. 프레임은 메모리에서만 처리하고
 * 저장하지 않는다(상시 녹화·자동 업로드 없음 — detect() 결과 문자열만 콜백으로 넘긴다).
 *
 * 이미 설치된 `@yudiel/react-qr-scanner`가 내보내는 `useDevices`(장치 목록)와
 * `createScannerError`(DOMException → 우리가 쓸 에러 종류 매핑: permission-denied/no-camera/
 * in-use/overconstrained/insecure-context/unsupported/aborted/security/type-error/unknown)를
 * 그대로 재사용한다 — 카메라 자체는 우리가 직접 열어 네이티브 우선 디코더(detector.ts)를 붙인다.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useDevices, createScannerError, type IScannerError } from "@yudiel/react-qr-scanner";
import {
  resolveDetector,
  startScanEngine,
  SCAN_FORMATS,
  type ScanFormat,
  type DetectedCode,
  type DetectorInfo,
  type ScanEngineHandle,
} from "./detector";

export type CameraStatus = "idle" | "starting" | "running" | "error" | "stopped";

export interface UseScanCameraOptions {
  formats?: readonly ScanFormat[];
  /** 검출 시도 간격(ms). 기본 220ms — 초당 수 프레임이면 충분하고 배터리/CPU를 아낀다. */
  intervalMs?: number;
}

export interface UseScanCameraResult {
  videoRef: RefObject<HTMLVideoElement>;
  status: CameraStatus;
  error: IScannerError | null;
  devices: MediaDeviceInfo[];
  deviceId: string | null;
  secureContext: boolean;
  detectorInfo: DetectorInfo | null;
  start: () => void;
  stop: () => void;
  switchDevice: (deviceId: string) => void;
}

export function useScanCamera(onResult: (code: DetectedCode) => void, opts?: UseScanCameraOptions): UseScanCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<ScanEngineHandle | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<IScannerError | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [detectorInfo, setDetectorInfo] = useState<DetectorInfo | null>(null);

  const devices = useDevices();
  const secureContext = typeof window === "undefined" ? true : window.isSecureContext;

  const stop = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus((s) => (s === "error" ? s : "stopped"));
  }, []);

  const start = useCallback(
    async (overrideDeviceId?: string) => {
      const targetDeviceId = overrideDeviceId ?? deviceId;

      if (typeof window === "undefined") return;
      if (!window.isSecureContext) {
        setError({
          kind: "insecure-context",
          message: "카메라는 HTTPS 또는 localhost에서만 동작합니다. http://192.168.x.x 같은 LAN 주소로는 카메라를 열 수 없습니다.",
          cause: null,
        });
        setStatus("error");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError({ kind: "unsupported", message: "이 브라우저는 카메라 스트림 API를 지원하지 않습니다.", cause: null });
        setStatus("error");
        return;
      }

      // 새로 시작하기 전에 이전 스트림을 반드시 정리한다(트랙 중복 방지).
      stop();
      setStatus("starting");
      setError(null);

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: targetDeviceId ? { deviceId: { exact: targetDeviceId } } : { facingMode: { ideal: "environment" } },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) {
          for (const track of stream.getTracks()) track.stop();
          streamRef.current = null;
          return;
        }
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => {
          /* 자동재생 정책으로 실패해도 srcObject는 연결돼 있어 사용자가 탭하면 재생된다 */
        });

        const actualId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (actualId) setDeviceId(actualId);

        const { detector, info } = await resolveDetector(opts?.formats ?? SCAN_FORMATS);
        setDetectorInfo(info);
        engineRef.current = startScanEngine(detector, video, (code) => onResultRef.current(code), {
          intervalMs: opts?.intervalMs,
          onError: (e) => console.warn("[scan] 디코딩 시도 실패(다음 프레임에서 재시도):", e),
        });
        setStatus("running");
      } catch (e) {
        setError(createScannerError(e));
        setStatus("error");
      }
    },
    // deviceId를 deps에 넣어도 재시작 루프가 생기지 않는다 — start()는 effect가 아니라 버튼
    // 클릭·switchDevice에서만 명시적으로 호출되므로, deviceId가 바뀌어 start 참조가 새로 만들어져도
    // 아무것도 자동으로 재호출하지 않는다(넣지 않으면 "다시 시작" 버튼이 마지막으로 고른 카메라를
    // 잊고 이전 카메라로 여는 오래된 클로저 버그가 생긴다).
    [stop, deviceId, opts?.formats, opts?.intervalMs]
  );

  const switchDevice = useCallback(
    (id: string) => {
      setDeviceId(id);
      void start(id);
    },
    [start]
  );

  // 언마운트 시(화면 이탈·사업장 전환·로그아웃으로 이 컴포넌트가 사라질 때) 반드시 정리한다.
  useEffect(() => stop, [stop]);

  // 탭이 백그라운드로 가거나 페이지가 떠날 때도 카메라 표시등을 끈다.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) stop();
    };
    const onPageHide = () => stop();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    };
  }, [stop]);

  return { videoRef, status, error, devices, deviceId, secureContext, detectorInfo, start: () => void start(), stop, switchDevice };
}
