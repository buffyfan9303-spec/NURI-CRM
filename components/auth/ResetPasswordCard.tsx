"use client";

import * as React from "react";
import { CircleAlert, CheckCircle2 } from "@/lib/icons";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";

export interface ResetPasswordCardProps {
  onSubmit: (email: string) => void | Promise<void>;
  loading?: boolean;
  error?: string;
  /** true면 발송 완료 상태를 보여준다(폼 대신). */
  sent?: boolean;
  onBackToLogin: () => void;
}

/** 비밀번호 재설정 요청 폼. 이메일 발송 여부만 다루고 실제 토큰 검증은 다루지 않는다. */
export function ResetPasswordCard({
  onSubmit,
  loading = false,
  error,
  sent = false,
  onBackToLogin,
}: ResetPasswordCardProps) {
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const busy = loading || submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSubmitting(true);
    try {
      await onSubmit(email);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto flex w-full max-w-[360px] flex-col items-center gap-2 text-center" role="status">
        <div className="mb-1 flex h-[48px] w-[48px] items-center justify-center rounded-full bg-auth-cta/15 text-[var(--auth-accent)]">
          <CheckCircle2 size={24} aria-hidden />
        </div>
        <h1 className="text-[20px] font-semibold text-auth-tx">메일을 보냈습니다</h1>
        <p className="max-w-[320px] text-[12.5px] leading-relaxed text-auth-tx2">
          {email ? `${email}로 ` : ""}비밀번호 재설정 링크를 보냈습니다. 받은편지함(스팸함 포함)을 확인하세요.
        </p>
        <AuthButton variant="ghost" onClick={onBackToLogin} className="mt-3">
          로그인으로 돌아가기
        </AuthButton>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-left text-[26px] font-bold leading-tight tracking-tight text-auth-tx lg:text-center lg:text-[32px]">
        비밀번호 재설정
      </h1>
      <p className="mb-6 mt-1.5 text-left text-[13px] leading-relaxed text-auth-tx2 lg:mb-8 lg:mt-2 lg:text-center">
        가입한 이메일을 입력하면 재설정 링크를 보내드립니다.
      </p>

      <div className="w-full">
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
            재설정 링크 보내기
          </AuthButton>
        </form>

        <div className="mt-4 flex items-center justify-center text-[12.5px] lg:mt-7">
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex min-h-[44px] items-center rounded px-1 font-semibold text-[var(--auth-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)] lg:[@media(pointer:fine)]:min-h-[32px]"
          >
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
