"use client";

import * as React from "react";
import { Card } from "@/components/ui/Card";
import { stageScan, listScanBatch } from "@/lib/scan/actions";
import { useKeyboardWedge } from "@/lib/scan/useKeyboardWedge";
import { isValidScanCode, isDuplicateWithinWindow } from "@/lib/scan/validate";
import { SCAN_MODE_LABEL, type ScanMode, type ScanBatchItem } from "@/lib/scan/types";
import type { Industry } from "@/lib/industry/config";
import { CameraPanel } from "./CameraPanel";
import { ManualEntry } from "./ManualEntry";
import { ResultCard, type ScanOutcome } from "./ResultCard";
import { BatchReviewList } from "./BatchReviewList";

const MODES_BY_INDUSTRY: Partial<Record<Industry, ScanMode[]>> = {
  rental: ["rental_checkout", "rental_return"],
  unmanned: ["unmanned_audit"],
  factory: ["factory_lookup"],
};

const DUPLICATE_WINDOW_MS = 3000;

const COMMIT_LABEL: Record<ScanMode, string> = {
  rental_checkout: "출고 확정",
  rental_return: "반납 접수",
  unmanned_audit: "실사 확정",
  factory_lookup: "확인 완료",
  generic: "확정",
};

export function ScanWorkspace({ businessId, industry, canWrite }: { businessId: string; industry: Industry; canWrite: boolean }) {
  // 배치 세션 키. 이 화면에 머무는 동안만 유효 — 새로고침하면 새 세션(이전 담긴 항목은 서버에 남아있지만
  // 새 세션에서는 안 보인다. 확정/종료로 정리하는 것을 전제로 한 설계다).
  const session = React.useMemo(() => crypto.randomUUID(), []);
  const modes = MODES_BY_INDUSTRY[industry] ?? ["generic"];
  const [mode, setMode] = React.useState<ScanMode>(modes[0]);
  const [outcome, setOutcome] = React.useState<ScanOutcome | null>(null);
  const [batch, setBatch] = React.useState<ScanBatchItem[]>([]);
  const seenRef = React.useRef<Map<string, number>>(new Map());
  const inFlightRef = React.useRef(false);

  const refreshBatch = React.useCallback(async () => {
    const r = await listScanBatch(businessId, session);
    if (r.ok) setBatch(r.data);
  }, [businessId, session]);

  React.useEffect(() => {
    void refreshBatch();
  }, [refreshBatch]);

  const handleCode = React.useCallback(
    async (raw: string) => {
      if (!canWrite) return; // CLICK-PATH-236: write 없이는 stage_scan RPC가 항상 거부한다 — 시도조차 하지 않는다.
      const code = raw.trim();
      if (!code) return;
      if (!isValidScanCode(code)) {
        setOutcome({ type: "error", message: "스캔 코드 형식이 올바르지 않습니다(제어문자 포함 또는 길이 초과)." });
        return;
      }
      const now = Date.now();
      if (isDuplicateWithinWindow(seenRef.current, code, now, DUPLICATE_WINDOW_MS)) {
        setOutcome({ type: "duplicate", code }); // 연속 중복 스캔(카메라 프레임 다중 인식) — 조용히 무시하지 않고 즉시 안내한다.
        return;
      }
      // 결함 CLICK-PATH-114: 이전엔 seenRef.set()을 inFlight 검사보다 먼저 해서, 처리 중에
      // 같은 코드를 다시 스캔하면 "이미 본 코드"로 조용히 버려져 영구 유실됐다. inFlight면
      // seenRef에 기록하지 않고 그냥 무시(카메라는 계속 프레임을 보내므로 처리가 끝난 뒤
      // 다시 스캔하면 그때 정상 처리된다).
      if (inFlightRef.current) return; // 이전 스캔 처리 중이면 겹쳐 호출하지 않는다
      seenRef.current.set(code, now);
      inFlightRef.current = true;

      setOutcome({ type: "loading" });
      const r = await stageScan(businessId, session, code, 1, mode);
      inFlightRef.current = false;
      if (!r.ok) {
        setOutcome({ type: "error", message: r.message });
        return;
      }
      setOutcome({ type: "result", data: r.data });
      if (r.data.kind !== "not_found" && r.data.kind !== "text") void refreshBatch();
    },
    [businessId, session, refreshBatch, canWrite, mode]
  );

  // USB/블루투스 키보드형 스캐너 — 입력 필드에 포커스가 없을 때만 개입한다(useKeyboardWedge 내부 가드).
  useKeyboardWedge((code) => void handleCode(code));

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-[18px] font-semibold text-t">스캔</h1>
        <p className="text-[12.5px] text-t2">카메라·바코드 스캐너·수동 입력으로 코드를 조회하고 목록에 담습니다. 지원 형식: QR코드, 1차원 바코드(EAN/Code128).</p>
      </div>

      {!canWrite && (
        <div role="status" className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 px-3.5 py-2.5 text-[12.5px] text-t2">
          write 권한이 없어 조회만 가능합니다. 스캔해 담거나 확정하려면 관리자에게 권한을 요청하세요.
        </div>
      )}

      {modes.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="스캔 모드">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? "min-h-[44px] rounded-[6px] border border-[var(--accent)] bg-[var(--accent-soft)] px-3 text-[12.5px] font-medium text-[var(--accent-ink)]"
                  : "min-h-[44px] rounded-[6px] border border-[var(--bd)] bg-sf2 px-3 text-[12.5px] text-t2 hover:bg-sf"
              }
            >
              {SCAN_MODE_LABEL[m]}
            </button>
          ))}
        </div>
      )}

      {/* PC: 카메라/입력 영역과 인식 목록을 나란히. 태블릿 이하: 세로 배치(§5.8). */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="mb-2 text-[13.5px] font-semibold text-t">카메라 스캔</h2>
            <CameraPanel onResult={(c) => void handleCode(c.rawValue)} paused={outcome?.type === "loading"} />
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-[13.5px] font-semibold text-t">수동 코드 입력</h2>
            <ManualEntry onSubmit={(code) => void handleCode(code)} busy={outcome?.type === "loading" || !canWrite} />
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-[13.5px] font-semibold text-t">스캔 결과</h2>
            <ResultCard outcome={outcome} mode={mode} />
          </Card>
        </div>

        <Card className="p-4 lg:sticky lg:top-4">
          <BatchReviewList businessId={businessId} session={session} mode={mode} items={batch} canWrite={canWrite} onChanged={refreshBatch} commitLabel={COMMIT_LABEL[mode]} />
        </Card>
      </div>
    </div>
  );
}
