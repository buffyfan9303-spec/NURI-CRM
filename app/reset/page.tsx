"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordCard } from "@/components/auth/ResetPasswordCard";
import { requestPasswordReset } from "@/lib/auth/actions";

export default function ResetPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [sent, setSent] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const handleSubmit = async (email: string) => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await requestPasswordReset(email, window.location.origin);
      if (!result.ok) {
        setError(result.detail ? `${result.message} — ${result.detail}` : result.message);
        return;
      }
      setSent(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell>
      <ResetPasswordCard
        onSubmit={handleSubmit}
        loading={pending}
        error={error}
        sent={sent}
        onBackToLogin={() => router.push("/login")}
      />
    </AuthShell>
  );
}
