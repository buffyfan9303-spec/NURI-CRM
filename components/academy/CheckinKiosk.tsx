"use client";

/**
 * 등원 코드 키오스크(0023 A4). 직원 로그인 세션 그대로 쓴다(별도 키오스크 인증 없음 —
 * write cap이 없으면 이 화면 자체를 page.tsx가 막는다). 학생이 숫자 패드로 코드를 입력하면
 * checkinByCode RPC가 오답 5회/60초 잠금까지 서버에서 판정한다 — 여기는 큰 버튼만 그린다.
 *
 * 레퍼런스: 클래스업 출결기기 — 번호 키패드, 등원 즉시 큰 확인 화면. 태블릿 세로(768~1024)에서 한 화면.
 */
import * as React from "react";
import { CheckCircle2, CircleAlert, Delete } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";
import { checkinByCode } from "@/lib/domain/academy-actions";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;
const MAX_LEN = 6;
const MIN_LEN = 4;
const RESULT_CLEAR_MS = 2500;

type Result =
  | { kind: "success"; studentName: string; className: string; status: "출석" | "지각" }
  | { kind: "error"; message: string };

export function CheckinKiosk({ businessId, businessName }: { businessId: string; businessName?: string }) {
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const clearTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  const press = React.useCallback((d: string) => {
    if (busy) return;
    setResult(null);
    if (d === "back") { setCode((c) => c.slice(0, -1)); return; }
    if (d === "clear") { setCode(""); return; }
    setCode((c) => (c.length >= MAX_LEN ? c : c + d));
  }, [busy]);

  const submit = React.useCallback(async () => {
    if (code.trim().length < MIN_LEN || busy) return;
    setBusy(true);
    setCode("");
    try {
      const r = await checkinByCode(businessId, code.trim());
      if (!r.ok) setResult({ kind: "error", message: r.message });
      else setResult({ kind: "success", studentName: r.data.studentName, className: r.data.className, status: r.data.status });
    } catch {
      // QA2-S02와 같은 패턴: 서버 액션이 throw하면 화면이 "확인 중…"에 멈춘 것처럼 보였다.
      setResult({ kind: "error", message: "처리하지 못했습니다. 잠시 후 다시 시도하세요." });
    } finally {
      setBusy(false);
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setResult(null), RESULT_CLEAR_MS);
  }, [businessId, code, busy]);

  // 물리 키보드(USB 키패드)도 지원 — 태블릿에 키패드를 붙여 쓰는 학원용.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") press("clear");
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, submit]);

  const KEY = "flex h-[64px] items-center justify-center rounded-[var(--r-lg)] border text-[26px] font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 sm:h-[76px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col items-center gap-5 py-2 sm:py-6">
      <div className="text-center">
        {businessName && <p className="text-[13px] font-medium text-t3">{businessName}</p>}
        <h1 className="mt-1 text-[24px] font-bold leading-tight tracking-tight text-t sm:text-[28px]">등원 코드를 입력하세요</h1>
        <p className="mt-1 text-[13px] text-t2">숫자 {MIN_LEN}~{MAX_LEN}자리 · 입력 후 확인</p>
      </div>

      <div className="w-full" aria-live="polite">
        {result ? (
          <Card
            role="status"
            className={cn(
              "flex min-h-[112px] w-full flex-col items-center justify-center gap-2 border-2 px-6 py-6 text-center",
              result.kind === "success" ? "border-[var(--okt)] bg-okb text-okt" : "border-[var(--et)] bg-eb text-et"
            )}
          >
            {result.kind === "success" ? (
              <>
                <CheckCircle2 size={40} aria-hidden />
                <p className="text-[26px] font-bold leading-tight">{result.studentName}</p>
                <p className="text-[15px] font-medium">{result.className} · {result.status}</p>
              </>
            ) : (
              <>
                <CircleAlert size={36} aria-hidden />
                <p className="text-[16px] font-medium leading-relaxed">{result.message}</p>
              </>
            )}
          </Card>
        ) : (
          <div className="flex h-[112px] w-full items-center justify-center gap-3 rounded-[var(--r-lg)] border-2 border-[var(--bd2)] bg-sf" aria-label={`입력한 자리수 ${code.length}`}>
            {Array.from({ length: MAX_LEN }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-4 w-4 rounded-full transition-colors sm:h-5 sm:w-5",
                  i < code.length ? "bg-[var(--accent-strong)]" : i < MIN_LEN ? "border-2 border-[var(--bd2)]" : "border-2 border-dashed border-[var(--bd)]"
                )}
                aria-hidden
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid w-full grid-cols-3 gap-3" role="group" aria-label="숫자 키패드">
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            disabled={busy || (d === "back" && code.length === 0) || (d === "clear" && code.length === 0)}
            onClick={() => press(d)}
            aria-label={d === "back" ? "한 글자 지우기" : d === "clear" ? "전체 지우기" : d}
            className={cn(KEY, d === "back" || d === "clear" ? "border-[var(--bd)] bg-sf2 text-[15px] text-t2 hover:bg-sf3" : "border-[var(--bd2)] bg-sf text-t hover:bg-sf2 active:bg-sel")}
          >
            {d === "back" ? <Delete size={26} aria-hidden /> : d === "clear" ? "지우기" : d}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={busy || code.trim().length < MIN_LEN}
        onClick={submit}
        className="min-h-[60px] w-full rounded-[var(--r-lg)] bg-[var(--accent-strong)] text-[18px] font-bold text-[var(--accent-contrast)] transition-[filter] hover:brightness-110 active:scale-[0.99] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {busy ? "확인 중…" : "확인"}
      </button>
    </div>
  );
}
