"use client";

import * as React from "react";
import { CircleAlert } from "@/lib/icons";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthPasswordInput } from "@/components/auth/AuthPasswordInput";
import { AuthButton } from "@/components/auth/AuthButton";

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export interface SignupCardProps {
  onSubmit: (input: SignupInput) => void | Promise<void>;
  loading?: boolean;
  error?: string;
  onLogin: () => void;
}

/** 가입 신청 폼. 계정 생성 후 실제 사업장 배정/승인은 서버·관리자 몫이다(순수 프레젠테이션). */
export function SignupCard({ onSubmit, loading = false, error, onLogin }: SignupCardProps) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [confirmError, setConfirmError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const busy = loading || submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password !== passwordConfirm) {
      setConfirmError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setConfirmError("");
    setSubmitting(true);
    try {
      await onSubmit({ name, email, password });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-left text-[26px] font-bold leading-tight tracking-tight text-auth-tx lg:text-center lg:text-[32px]">
        가입 신청
      </h1>
      <p className="mb-6 mt-1.5 text-left text-[13px] leading-relaxed text-auth-tx2 lg:mb-8 lg:mt-2 lg:text-center">
        계정을 만든 뒤 사업장 소속·권한은 관리자 승인으로 결정됩니다.
      </p>

      <div className="w-full">
        <form onSubmit={handleSubmit} noValidate>
          <AuthInput
            label="이름"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
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
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <AuthPasswordInput
            label="비밀번호 확인"
            autoComplete="new-password"
            required
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            error={confirmError || undefined}
            disabled={busy}
          />

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-[8px] border border-[var(--auth-error)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--auth-error)]"
            >
              <CircleAlert size={15} className="mt-[1px] shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <AuthButton type="submit" loading={busy} className="mt-6">
            가입 신청
          </AuthButton>
        </form>

        <div className="mt-4 flex items-center justify-center gap-1 text-[12.5px] text-auth-tx2 lg:mt-7">
          이미 계정이 있으신가요?
          <button
            type="button"
            onClick={onLogin}
            className="inline-flex min-h-[44px] items-center rounded px-1 font-semibold text-[var(--auth-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)] lg:[@media(pointer:fine)]:min-h-[32px]"
          >
            로그인
          </button>
        </div>
      </div>
    </div>
  );
}
