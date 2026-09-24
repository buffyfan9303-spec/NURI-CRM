"use client";

/**
 * 로그인 페이지 클라이언트 부분.
 * 업종 선택(진입 의도, 세션스토리지 힌트일 뿐 — 권한 근거 아님) + 실제 로그인.
 * 실패 사유별로 문구를 구분한다(계약 §5-5 정신: 실패를 성공처럼 보이지 않는다).
 *
 * 레이아웃은 §8·§10: 카드 없는 중앙 폼, 로그인이 주 목적이라 업종 선택은
 * 폼 아래 접이식 보조 섹션으로 둔다(2열 좌측 패널은 사라졌다).
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, INDUSTRY_ICON } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginCard } from "@/components/auth/LoginCard";
import { IndustryPicker, type IndustryOption } from "@/components/auth/IndustryPicker";
import { signIn } from "@/lib/auth/actions";
import { INDUSTRIES, INDUSTRY_DEFS } from "@/lib/industry/config";
import { ENTRY_INDUSTRY_KEY } from "@/components/shell/entryIndustry";

const INDUSTRY_OPTIONS: IndustryOption[] = INDUSTRIES.map((key) => {
  const def = INDUSTRY_DEFS[key];
  return { key: def.key, name: def.name, desc: def.desc, icon: INDUSTRY_ICON[key] };
});

export function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from");
  const err = params.get("err");

  const [industry, setIndustry] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(
    err === "config"
      ? "서버 환경설정이 완료되지 않았습니다. 관리자에게 문의하세요."
      : err === "confirm"
      ? "인증 링크가 만료되었거나 이미 사용되었습니다. 다시 가입 신청해 주세요."
      : undefined
  );
  const [pending, setPending] = React.useState(false);
  const [industryOpen, setIndustryOpen] = React.useState(false);

  const handleSubmit = async (email: string, password: string) => {
    if (pending) return; // 중복 제출 차단
    setPending(true);
    setError(undefined);
    try {
      const result = await signIn(email, password);
      if (!result.ok) {
        setError(result.detail ? `${result.message} — ${result.detail}` : result.message);
        return;
      }
      if (industry) {
        try {
          window.sessionStorage.setItem(ENTRY_INDUSTRY_KEY, industry);
        } catch {
          /* 세션스토리지 접근 실패는 무시 — 진입 의도 힌트일 뿐 */
        }
      }
      router.replace(from || "/select");
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell>
      <LoginCard
        onSubmit={handleSubmit}
        loading={pending}
        error={error}
        notice={notice}
        onForgot={() => router.push("/reset")}
        onSignup={() => router.push("/signup")}
      />

      <div className="mt-2 w-full lg:mt-8">
        <button
          type="button"
          onClick={() => setIndustryOpen((v) => !v)}
          aria-expanded={industryOpen}
          aria-controls="login-industry-panel"
          className="mx-auto flex min-h-[44px] items-center gap-1.5 rounded px-2 text-[12.5px] text-auth-tx2 hover:text-auth-tx focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-tx)] lg:[@media(pointer:fine)]:min-h-[32px]"
        >
          <span>
            업종 선택{industry ? ` · ${INDUSTRY_DEFS[industry as keyof typeof INDUSTRY_DEFS]?.name}` : " (선택)"}
          </span>
          <ChevronDown size={14} className={cn("transition-transform", industryOpen && "rotate-180")} aria-hidden />
        </button>
        <div id="login-industry-panel" className={cn(industryOpen ? "mt-4 block" : "hidden")}>
          <IndustryPicker industries={INDUSTRY_OPTIONS} value={industry} onChange={setIndustry} layout="list" />
        </div>
      </div>
    </AuthShell>
  );
}
