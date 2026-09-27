"use client";

import * as React from "react";
import { Card } from "@/components/ui/Card";
import { stageScan, resolveScan, listScanBatch } from "@/lib/scan/actions";
import { useKeyboardWedge } from "@/lib/scan/useKeyboardWedge";
import { isValidScanCode, noteCameraSighting, normalizeScanCode, isEan13ChecksumError, newSessionKey } from "@/lib/scan/validate";
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

/** 카메라에서 같은 코드가 이 시간 이상 안 보이다가 다시 보이면 의도적 재스캔으로 본다(D3). */
const CAMERA_GAP_MS = 1500;

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
  const session = React.useMemo(() => newSessionKey(), []); // D4: http LAN 에는 crypto.randomUUID 가 없다
  const modes = MODES_BY_INDUSTRY[industry] ?? ["generic"];
  const [mode, setMode] = React.useState<ScanMode>(modes[0]);
  const [outcome, setOutcome] = React.useState<ScanOutcome | null>(null);
  const [batch, setBatch] = React.useState<ScanBatchItem[]>([]);
  /** 카메라가 마지막으로 이 코드를 "본" 시각(D3). 화면에 계속 있는 동안은 재처리하지 않는다. */
  const lastSeenRef = React.useRef<Map<string, number>>(new Map());
  /** 이 세션에서 담긴 코드 → 대상 id. 그 대상이 아직 목록에 있으면 카메라 재인식은 다시 담지 않는다(수량은 목록의 + 버튼으로). */
  const stagedRef = React.useRef<Map<string, string>>(new Map());
  const batchRef = React.useRef<ScanBatchItem[]>([]);
  const inFlightRef = React.useRef(false);

  const refreshBatch = React.useCallback(async () => {
    const r = await listScanBatch(businessId, session);
    if (r.ok) {
      batchRef.current = r.data;
      setBatch(r.data);
    }
  }, [businessId, session]);
  const isStillStaged = (code: string) => {
    const target = stagedRef.current.get(code);
    return target !== undefined && batchRef.current.some((b) => b.targetId === target);
  };

  React.useEffect(() => {
    void refreshBatch();
  }, [refreshBatch]);

  /**
   * source: "camera" 는 0.2초마다 같은 코드를 반복해 내놓으므로 "보인 시각" 기준으로 1회만 처리한다.
   * "manual"(수동 입력·키보드형 스캐너)은 사람이 한 번 보낸 것이므로 항상 처리하되, 이미 담긴 코드면
   * 결과에 "다시 담음(수량 +1)" 표시를 붙인다(D3 — 의도적 추가로 본다).
   */
  const handleCode = React.useCallback(
    async (raw: string, source: "camera" | "manual") => {
      const code = normalizeScanCode(raw); // D9: 공백만 벗긴다 — 서버가 대소문자 그대로 비교한다
      if (!code) return;
      if (source === "camera") {
        const sighting = noteCameraSighting(lastSeenRef.current, code, Date.now(), CAMERA_GAP_MS);
        if (sighting === "continuous") return; // D5: 아직 화면에 있는 같은 코드 — 마지막 결과를 유지하고 조용히 무시
        if (isStillStaged(code)) {
          setOutcome({ type: "duplicate", code });
          return;
        }
      }
      if (!isValidScanCode(code)) {
        setOutcome({ type: "error", message: "스캔 코드 형식이 올바르지 않습니다(제어문자 포함 또는 길이 초과)." });
        return;
      }
      if (isEan13ChecksumError(code)) {
        setOutcome({ type: "error", message: `바코드 체크섬 오류(${code}) — 잘못 읽혔습니다. 다시 스캔하거나 코드를 직접 입력하세요.` });
        return;
      }
      // 결함 CLICK-PATH-114: 처리 중에 들어온 코드는 기록 없이 무시한다(카메라는 다음 프레임에서 다시 보이고,
      // lastSeen 은 이미 갱신됐으므로 "안 보이다 다시 나타남"으로 오판하지 않는다).
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const again = source === "manual" && isStillStaged(code);

      setOutcome({ type: "loading" });
      // D6: viewer 는 조회만(resolve_scan 은 view cap). 담기·확정은 write.
      const r = canWrite ? await stageScan(businessId, session, code, 1, mode) : await resolveScan(businessId, session, code);
      inFlightRef.current = false;
      if (!r.ok) {
        setOutcome({ type: "error", message: r.message });
        return;
      }
      setOutcome({ type: "result", data: r.data, again });
      if (r.data.staged && r.data.id) {
        stagedRef.current.set(code, r.data.id);
        void refreshBatch();
      }
    },
    [businessId, session, refreshBatch, canWrite, mode]
  );

  // USB/블루투스 키보드형 스캐너 — 입력 필드에 포커스가 없을 때만 개입한다(useKeyboardWedge 내부 가드).
  useKeyboardWedge((code) => void handleCode(code, "manual"));

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-[18px] font-semibold text-t">스캔</h1>
        <p className="text-[12.5px] text-t2">카메라·바코드 스캐너·수동 입력으로 코드를 조회하고 목록에 담습니다. 지원 형식: QR코드, 1차원 바코드(EAN/Code128).</p>
      </div>

      {!canWrite && (
        <div role="status" className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 px-3.5 py-2.5 text-[12.5px] text-t2">
          조회만 가능합니다(write 권한 없음). 코드가 무엇인지는 확인할 수 있지만 목록에 담거나 확정할 수는 없습니다.
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
            <CameraPanel onResult={(c) => void handleCode(c.rawValue, "camera")} />
          </Card>

          <Card className="p-4">
            <h2 className="text-[13.5px] font-semibold text-t">수동 코드 입력</h2>
            {/* C11: 설명은 placeholder 가 아니라 라벨로(휴대폰에서 잘리지 않게). */}
            <p id="manual-entry-help" className="mb-2 text-[12.5px] text-t2">개체코드·SKU·주문번호 등을 입력하고 조회를 누르세요.</p>
            <ManualEntry onSubmit={(code) => void handleCode(code, "manual")} busy={outcome?.type === "loading"} />
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
