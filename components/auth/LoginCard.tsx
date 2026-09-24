"use client";

import * as React from "react";
import { CircleAlert, Info } from "@/lib/icons";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthPasswordInput } from "@/components/auth/AuthPasswordInput";
import { AuthButton } from "@/components/auth/AuthButton";

export interface LoginCardProps {
  onSubmit: (email: string, password: string) => void | Promise<void>;
  /** 상위(메인)에서 진행 중인 요청이 있을 때 전달 — submitting과 OR 조건으로 버튼을 잠근다. */
  loading?: boolean;
  error?: string;
  /** 예: "비밀번호를 재설정했습니다. 새 비밀번호로 로그인하세요." */
  notice?: string;
  onForgot: () => void;
  onSignup: () => void;
}

/**
 * 로그인 폼 — 넷플릭스 로그인 순서(2026-09-25 사용자 지시).
 *
 * 제목 → (오류 띠) → 떠오르는 라벨 입력 2개 → 청록 CTA → "또는" → 회색 보조(가입 신청) → 비밀번호 찾기.
 * 넷플릭스의 "로그인 코드 사용"·"로그인 정보 저장" 은 이 앱에 실제 기능이 없어 넣지 않는다 —
 * 동작하지 않는 버튼은 디자인이 아니라 거짓말이다. 그 자리는 실제 동작(가입 신청)으로 채운다.
 *
 * 데이터 페칭·Supabase 호출·라우팅 없음 — props/콜백만 쓰는 순수 프레젠테이션.
 */
export function LoginCard({
  onSubmit,
  loading = false,
  error,
  notice,
  onForgot,
  onSignup,
}: LoginCardProps) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const busy = loading || submitting;
  const errorRef = React.useRef<HTMLDivElement>(null);

  // 실패하면 오류로 포커스를 옮긴다(§10.1 "오류 포커스"). 입력값은 지우지 않는다.
  React.useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return; // 중복 제출 차단
    setSubmitting(true);
    try {
      await onSubmit(email, password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* 넷플릭스와 같이 제목은 왼쪽 정렬 한 줄. 부제는 짧게. */}
      <h1 className="text-left text-[28px] font-bold leading-tight tracking-tight text-auth-tx sm:text-[32px]">로그인</h1>
      <p className="mb-6 mt-1.5 text-left text-[13.5px] text-auth-tx2 sm:mb-7">NURI CRM 계정으로 업무를 시작하세요.</p>

      {notice && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-[4px] border border-auth-field-bd bg-auth-field px-3.5 py-2.5 text-[12.5px] text-auth-tx"
        >
          <Info size={15} className="mt-[1px] shrink-0 text-[var(--auth-accent)]" aria-hidden />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        /* 넷플릭스처럼 실패 안내는 입력 **위**에 눈에 띄는 띠로. 실패하면 여기로 포커스를 옮긴다. */
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-[4px] bg-[var(--auth-error)] px-3.5 py-3 text-[13px] font-medium text-white outline-none dark:text-[#1a0a0d]"
        >
          <CircleAlert size={15} className="mt-[2px] shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <AuthInput
          label="이메일"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <AuthPasswordInput
          label="비밀번호"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />

        <AuthButton type="submit" loading={busy} className="mt-2">
          {busy ? "로그인 중…" : "로그인"}
        </AuthButton>
      </form>

      {/* 넷플릭스: CTA → "또는" → 회색 보조 버튼 → 가운데 "비밀번호를 잊으셨나요?" */}
      <p className="my-3 text-center text-[13px] uppercase text-auth-tx2" aria-hidden>
        또는
      </p>
      <AuthButton variant="secondary" onClick={onSignup}>
        가입 신청하기
      </AuthButton>

      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={onForgot}
          /* 터치 44px — 글자 크기는 그대로, hit area 만 키운다. */
          className="inline-flex min-h-[44px] items-center rounded px-1 text-[14px] text-auth-tx underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)]"
        >
          비밀번호를 잊으셨나요?
        </button>
      </div>
    </div>
  );
}
