"use client";

/**
 * 가입 신청 페이지.
 * 로컬 개발 스택은 인증 메일이 실제로 발송되지 않고 Mailpit(http://127.0.0.1:54324)로 간다 —
 * 로컬에서 확인하려면 그 주소를 열어보면 된다(운영 안내 문구에는 넣지 않는다).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "@/lib/icons";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupCard, type SignupInput } from "@/components/auth/SignupCard";
import { AuthButton } from "@/components/auth/AuthButton";
import { signUp } from "@/lib/auth/actions";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [pending, setPending] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const handleSubmit = async ({ name, email, password }: SignupInput) => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await signUp(email, password, name);
      if (!result.ok) {
        setError(result.detail ? `${result.message} — ${result.detail}` : result.message);
        return;
      }
      setSentTo(email);
    } finally {
      setPending(false);
    }
  };

  if (sentTo) {
    return (
      <AuthShell>
        <div className="mx-auto flex w-full max-w-[360px] flex-col items-center gap-2 text-center">
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-auth-field-bd bg-auth-field text-auth-tx">
            <MailCheck size={22} aria-hidden />
          </div>
          <h1 className="text-[20px] font-semibold text-auth-tx">인증 메일을 확인하세요</h1>
          <p className="max-w-[320px] text-[12.5px] leading-relaxed text-auth-tx2">
            {sentTo}로 인증 메일을 보냈습니다. 메일의 링크를 눌러 인증을 완료한 뒤 로그인하세요.
            사업장 소속·권한은 이후 관리자 승인으로 결정됩니다.
          </p>
          <AuthButton variant="ghost" className="mt-3" onClick={() => router.push("/login")}>
            로그인으로 이동
          </AuthButton>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <SignupCard onSubmit={handleSubmit} loading={pending} error={error} onLogin={() => router.push("/login")} />
    </AuthShell>
  );
}
