"use client";

import * as React from "react";
import { Camera, CameraOff, RefreshCw, Video } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { useScanCamera } from "@/lib/scan/useScanCamera";
import type { DetectedCode } from "@/lib/scan/detector";
import { ScanOverlay } from "./ScanOverlay";
import type { IScannerError } from "@yudiel/react-qr-scanner";

const ERROR_COPY: Record<IScannerError["kind"], { title: string; detail: string }> = {
  "permission-denied": {
    title: "카메라 권한이 거부되었습니다.",
    detail: "브라우저 주소창 왼쪽의 사이트 설정에서 카메라 권한을 허용한 뒤 다시 시도하세요.",
  },
  "no-camera": {
    title: "카메라를 찾을 수 없습니다.",
    detail: "이 기기에 사용 가능한 카메라가 없습니다. 아래 수동 입력을 이용하세요.",
  },
  "in-use": {
    title: "카메라를 다른 앱이 사용 중입니다.",
    detail: "화상회의·다른 브라우저 탭 등 카메라를 쓰는 다른 프로그램을 종료한 뒤 다시 시도하세요.",
  },
  overconstrained: {
    title: "선택한 카메라를 열 수 없습니다.",
    detail: "다른 카메라를 선택하거나 다시 시도하세요.",
  },
  "insecure-context": {
    title: "보안 연결(HTTPS)이 아닙니다.",
    detail:
      "카메라는 HTTPS 또는 localhost에서만 동작합니다. 태블릿에서 http://192.168.x.x 같은 LAN 주소로 접속하면 카메라가 열리지 않습니다. " +
      "`npm run dev:https`로 실행하거나 `npm run tunnel`로 발급된 HTTPS 주소로 접속하세요.",
  },
  unsupported: {
    title: "이 브라우저는 카메라 스캔을 지원하지 않습니다.",
    detail: "아래 수동 입력으로 코드를 직접 입력하세요.",
  },
  aborted: { title: "카메라 시작이 중단되었습니다.", detail: "다시 시도해 주세요." },
  security: { title: "보안 정책으로 카메라를 열 수 없습니다.", detail: "관리자에게 문의하세요." },
  "type-error": { title: "카메라를 여는 중 오류가 발생했습니다.", detail: "다시 시도해 주세요." },
  unknown: { title: "카메라를 여는 중 알 수 없는 오류가 발생했습니다.", detail: "다시 시도하거나 수동 입력을 이용하세요." },
};

export function CameraPanel({ onResult, paused }: { onResult: (code: DetectedCode) => void; paused?: boolean }) {
  const cam = useScanCamera(
    React.useCallback(
      (code) => {
        if (!paused) onResult(code);
      },
      [onResult, paused]
    )
  );

  const engineLabel =
    cam.detectorInfo?.engine === "native"
      ? "네이티브 디코더"
      : cam.detectorInfo?.engine === "wasm"
        ? "내장 디코더(WASM)"
        : undefined;

  return (
    <div className="flex flex-col gap-2.5">
      {!cam.secureContext && (
        <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-wb px-3 py-2.5 text-[12px] leading-relaxed text-wt">
          {ERROR_COPY["insecure-context"].detail}
        </div>
      )}

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--r-lg)] border border-[var(--bd)] bg-black sm:aspect-video">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={cam.videoRef} className="h-full w-full object-cover" playsInline muted />

        {cam.status === "running" && <ScanOverlay hint="사각형 안에 QR·바코드를 맞춰주세요" engineLabel={engineLabel} />}

        {cam.status !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-5 text-center text-white">
            {cam.status === "starting" && (
              <>
                <Video size={26} className="animate-pulse" aria-hidden />
                <p className="text-[13px]">카메라를 여는 중…</p>
              </>
            )}
            {cam.status === "idle" && cam.secureContext && (
              <>
                <Camera size={26} aria-hidden />
                <p className="text-[13px]">카메라로 QR·바코드를 스캔합니다.</p>
                <Button size="md" onClick={cam.start} className="min-w-[140px]">
                  카메라 시작
                </Button>
              </>
            )}
            {cam.status === "stopped" && (
              <>
                <CameraOff size={26} aria-hidden />
                <p className="text-[13px]">카메라가 꺼져 있습니다.</p>
                <Button size="md" onClick={cam.start} className="min-w-[140px]">
                  <RefreshCw size={15} aria-hidden />
                  다시 시작
                </Button>
              </>
            )}
            {cam.status === "error" && cam.error && (
              <>
                <CameraOff size={26} aria-hidden />
                <p className="text-[13.5px] font-semibold">{ERROR_COPY[cam.error.kind].title}</p>
                <p className="max-w-[320px] text-[12px] leading-relaxed text-white/85">{ERROR_COPY[cam.error.kind].detail}</p>
                {cam.error.kind !== "insecure-context" && cam.error.kind !== "unsupported" && (
                  <Button size="sm" variant="secondary" onClick={cam.start}>
                    <RefreshCw size={14} aria-hidden />
                    다시 시도
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {cam.devices.length > 1 && (
        <label className="flex items-center gap-2 text-[12.5px] text-t2">
          카메라 선택
          <select
            value={cam.deviceId ?? ""}
            onChange={(e) => cam.switchDevice(e.target.value)}
            className="h-[44px] flex-1 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-sf px-2 text-[12.5px] text-t outline-none"
          >
            {cam.devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `카메라 ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
