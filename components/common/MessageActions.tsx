"use client";

/**
 * 문구 보내기 공용 위젯 — 복사·공유·문자·전화. 어느 화면에서든 문자열(text) + 선택적 전화번호(phone)만
 * 넘기면 되고, 필요하면 호출부가 자체 Modal 안에 이 컴포넌트를 넣는다(이 컴포넌트 자체는 모달을
 * 강제하지 않는다 — 노쇼 안내·리마인더·초대 문구 등 위치가 화면마다 다르기 때문).
 * 클립보드 실패(권한 없음/비보안 컨텍스트)는 조용히 무시하지 않고 숨겨진 textarea + execCommand로 폴백한다.
 */
import * as React from "react";
import { CircleAlert, Check, Copy, Share2, MessageSquare, Phone } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { smsHref, telHref } from "@/lib/domain/messages";

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 아래 폴백으로 이어짐(권한 거부·비보안 컨텍스트 등)
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** sms: 링크는 OS별로 본문 파라미터 구분자가 다르다(iOS `&body=`, 그 외 `?body=`) — lib/domain/messages.smsHref가 단일 출처. */
function platform(): "ios" | "android" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return "ios";
  if (/Android/.test(navigator.userAgent)) return "android";
  return "unknown";
}

export function MessageActions({
  text,
  phone,
  title = "메시지",
}: {
  text: string;
  phone?: string;
  title?: string;
}) {
  const [value, setValue] = React.useState(text);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // 부모가 넘기는 초기 문구가 바뀌면(다른 대상으로 전환 등) 편집 중이던 값도 따라간다.
  React.useEffect(() => setValue(text), [text]);
  React.useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleCopy = async () => {
    setError(null);
    const ok = await copyText(value);
    if (!ok) { setError("복사하지 못했습니다. 문구를 길게 눌러 직접 복사해 주세요."); return; }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!canShare) return;
    setError(null);
    try {
      // navigator.share가 뜨는 OS 공유 시트에 카카오톡이 설치돼 있으면 대상으로 선택할 수 있다
      // (앱 자체를 특정해 호출하는 API는 웹 표준에 없다 — 시트 노출까지가 웹에서 할 수 있는 전부).
      await navigator.share({ title, text: value });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // 사용자가 취소함
      setError("공유하지 못했습니다.");
    }
  };

  const handleSms = () => {
    const href = smsHref(phone, value, platform());
    if (!href) return;
    window.location.href = href;
  };

  const handleCall = () => {
    const href = telHref(phone);
    if (!href) return;
    window.location.href = href;
  };

  return (
    <div className="flex flex-col gap-2.5">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-eb px-3.5 py-2.5 text-[12.5px] text-et">
          <CircleAlert size={15} className="mt-[1px] shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {copied && (
        <div role="status" className="flex items-start gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-okb px-3.5 py-2.5 text-[12.5px] text-okt">
          <Check size={15} className="mt-[1px] shrink-0" aria-hidden />
          <span>문구를 복사했습니다.</span>
        </div>
      )}
      <label className="flex flex-col gap-1 text-[12.5px] font-medium text-t2">
        {title}
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          className="min-h-[88px] w-full resize-y rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 py-2 text-[13px] text-t outline-none focus:border-[var(--accent)]"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="md" onClick={handleCopy}>
          <Copy size={15} aria-hidden />
          문구 복사
        </Button>
        {canShare && (
          <Button type="button" variant="secondary" size="md" onClick={handleShare}>
            <Share2 size={15} aria-hidden />
            공유
          </Button>
        )}
        {phone && (
          <>
            <Button type="button" variant="secondary" size="md" onClick={handleSms}>
              <MessageSquare size={15} aria-hidden />
              문자
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={handleCall}>
              <Phone size={15} aria-hidden />
              전화
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
