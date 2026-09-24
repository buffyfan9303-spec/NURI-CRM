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
 * 로그인 폼. 카드가 아니라 프레임 좌측 칼럼 안에 바로 놓인다(§8.2: 좌측을 또 카드로 감싸지 않는다).
 *
 * 순서는 §10.1 그대로: 제목 → 실제 입력 2개 → 실제 보조 동작 → 보라 CTA → 가입 안내.
 * 원본의 확인 비밀번호·Wallet·미연결 Google·반복 OR 은 넣지 않는다 — 동작하지 않는 버튼은
 * 디자인이 아니라 거짓말이다. 보라 pill 은 원본처럼 맨 아래가 아니라 **입력 바로 아래**에 둔다
 * (§10.1: 원본 위치를 맞추려고 수백 px 공백을 만들지 않는다).
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
      {/* 휴대폰은 왼쪽 정렬(앱형 단일 화면), PC 는 원본03 처럼 폼 중앙 축. */}
      <h1 className="text-left text-[26px] font-bold leading-tight tracking-tight text-auth-tx lg:text-center lg:text-[32px]">
        로그인
      </h1>
      <p className="mb-6 mt-1.5 text-left text-[13.5px] text-auth-tx2 lg:mb-7 lg:mt-2 lg:text-center">
        NURI CRM 계정으로 업무를 시작하세요.
      </p>

      {notice && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-[8px] border border-auth-field-bd bg-auth-field px-3.5 py-2.5 text-[12.5px] text-auth-tx"
        >
          <Info size={15} className="mt-[1px] shrink-0 text-[var(--auth-accent)]" aria-hidden />
          <span>{notice}</span>
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
          placeholder="name@company.co.kr"
          disabled={busy}
        />
        <AuthPasswordInput
          label="비밀번호"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호를 입력하세요"
          disabled={busy}
        />

        <div className="-mt-1 mb-1 flex justify-end lg:mt-0">
          <button
            type="button"
            onClick={onForgot}
            /* 터치 44px(<lg) — 글자 크기는 그대로, hit area 만 키운다. */
            className="inline-flex min-h-[44px] items-center rounded px-1 text-[12.5px] text-[var(--auth-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)] lg:[@media(pointer:fine)]:min-h-[32px]"
          >
            비밀번호를 잊으셨나요?
          </button>
        </div>

        {error && (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="mb-1 mt-3 flex items-start gap-2 rounded-[8px] border border-[var(--auth-error)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--auth-error)] outline-none"
          >
            <CircleAlert size={15} className="mt-[1px] shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <AuthButton type="submit" loading={busy} className="mt-5">
          {busy ? "로그인 중…" : "로그인"}
        </AuthButton>
      </form>

      <div className="mt-4 flex items-center justify-center gap-1.5 text-[12.5px] text-auth-tx2 lg:mt-6">
        계정이 없으신가요?
        <button
          type="button"
          onClick={onSignup}
          className="inline-flex min-h-[44px] items-center rounded px-1 font-semibold text-[var(--auth-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)] lg:[@media(pointer:fine)]:min-h-[32px]"
        >
          가입 신청
        </button>
      </div>
    </div>
  );
}
