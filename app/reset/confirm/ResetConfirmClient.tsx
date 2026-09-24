"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, KeyRound, Loader2 } from "@/lib/icons";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthPasswordInput } from "@/components/auth/AuthPasswordInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { signOut } from "@/lib/auth/actions";
import { exchangeRecoveryCode, updateUserPassword } from "./actions";

type Stage = "exchanging" | "invalid" | "ready" | "done";

export function ResetConfirmClient({ code }: { code: string | null }) {
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>("exchanging");
  const [exchangeError, setExchangeError] = React.useState<string | undefined>(undefined);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [formError, setFormError] = React.useState<string | undefined>(undefined);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code) {
        setExchangeError("재설정 링크가 올바르지 않습니다. 다시 요청해 주세요.");
        setStage("invalid");
        return;
      }
      const result = await exchangeRecoveryCode(code);
      if (cancelled) return;
      if (!result.ok) {
        setExchangeError(result.message);
        setStage("invalid");
        return;
      }
      setStage("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (password !== confirm) {
      setFormError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setFormError(undefined);
    setPending(true);
    try {
      const result = await updateUserPassword(password);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setStage("done");
    } finally {
      setPending(false);
    }
  };

  if (stage === "exchanging") {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-3 py-10 text-center" role="status" aria-live="polite">
          <Loader2 size={24} className="animate-spin text-[var(--auth-accent)]" aria-hidden />
          <p className="text-[13px] text-auth-tx2">재설정 링크를 확인하는 중…</p>
        </div>
      </AuthShell>
    );
  }

  if (stage === "invalid") {
    return (
      <AuthShell>
        <div className="mx-auto flex w-full max-w-[360px] flex-col items-center gap-2 text-center">
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-auth-field-bd bg-auth-field text-auth-tx">
            <CircleAlert size={22} aria-hidden />
          </div>
          <h1 className="text-[20px] font-semibold text-auth-tx">링크를 사용할 수 없습니다</h1>
          <p className="max-w-[320px] text-[12.5px] leading-relaxed text-auth-tx2">{exchangeError}</p>
          <AuthButton variant="ghost" className="mt-3" onClick={() => router.push("/reset")}>
            재설정 다시 요청
          </AuthButton>
        </div>
      </AuthShell>
    );
  }

  if (stage === "done") {
    return (
      <AuthShell>
        <div className="mx-auto flex w-full max-w-[360px] flex-col items-center gap-2 text-center">
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-auth-field-bd bg-auth-field text-auth-tx">
            <CheckCircle2 size={22} aria-hidden />
          </div>
          <h1 className="text-[20px] font-semibold text-auth-tx">비밀번호를 변경했습니다</h1>
          <p className="max-w-[320px] text-[12.5px] leading-relaxed text-auth-tx2">
            보안을 위해 다시 로그인해 주세요.
          </p>
          <AuthButton className="mt-3" onClick={() => signOut()}>
            로그인으로 이동
          </AuthButton>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-left text-[28px] font-bold leading-tight tracking-tight text-auth-tx sm:text-[32px]">
        새 비밀번호 설정
      </h1>
      <p className="mb-6 mt-1.5 text-left text-[13px] text-auth-tx2 sm:mb-7 sm:mt-2">새로 사용할 비밀번호를 입력하세요.</p>
      <div className="w-full">
        <form onSubmit={handleSubmit} noValidate>
          <AuthPasswordInput
            label="새 비밀번호"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
          />
          <AuthPasswordInput
            label="새 비밀번호 확인"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={formError}
            disabled={pending}
          />
          <AuthButton type="submit" loading={pending} className="mt-6">
            <KeyRound size={16} aria-hidden />
            비밀번호 변경
          </AuthButton>
        </form>
      </div>
    </AuthShell>
  );
}
