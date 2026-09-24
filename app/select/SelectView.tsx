"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "@/lib/icons";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthButton } from "@/components/auth/AuthButton";
import { BusinessPicker } from "@/components/auth/BusinessPicker";
import { PendingApprovalCard } from "@/components/auth/PendingApprovalCard";
import { signOut } from "@/lib/auth/actions";
import type { MyBusinessesResult } from "@/lib/auth/actions";
import { readEntryIndustryHint } from "@/components/shell/entryIndustry";
import { CreateBusinessForm } from "./CreateBusinessForm";

export function SelectView({ result }: { result: MyBusinessesResult }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRetry = () => {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 600);
  };

  if (!result.ok) {
    return (
      <AuthShell>
        <div className="mx-auto flex w-full max-w-[360px] flex-col items-center gap-2 text-center">
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-auth-field-bd bg-auth-field text-auth-tx">
            <TriangleAlert size={22} aria-hidden />
          </div>
          <h1 className="text-[20px] font-semibold text-auth-tx">사업장 목록을 불러오지 못했습니다.</h1>
          {result.reason === "error" && (
            <p className="max-w-[320px] text-[12.5px] leading-relaxed text-auth-tx2">{result.message}</p>
          )}
          <AuthButton variant="ghost" onClick={handleRetry} loading={refreshing} className="mt-2">
            다시 시도
          </AuthButton>
        </div>
      </AuthShell>
    );
  }

  const { businesses, pending } = result;

  // 활성 소속이 있으면 그것부터 고르게 한다. 진입 의도(업종)로 상단 정렬만 한다 — 권한 근거 아님.
  // 카드가 최대 3열까지 펼쳐질 수 있어 좁은 폼 폭에 맞지 않는다 — AuthShell의 wide 폭을 쓴다(§10.2).
  if (businesses.length > 0) {
    const hint = readEntryIndustryHint();
    const sorted = hint
      ? [...businesses].sort((a, b) => Number(b.industry === hint) - Number(a.industry === hint))
      : businesses;

    return (
      <AuthShell width="wide">
        <BusinessPicker businesses={sorted} onPick={(id) => router.push(`/w/${id}`)} />
        {pending.length > 0 && (
          <p className="mt-5 text-center text-[12px] text-auth-tx2">
            그 외 {pending.length}건은 관리자 승인을 기다리고 있습니다.
          </p>
        )}
      </AuthShell>
    );
  }

  if (pending.length > 0) {
    return (
      <AuthShell>
        <PendingApprovalCard
          businessName={pending[0].name}
          onLogout={() => signOut()}
          onRefresh={handleRetry}
          refreshing={refreshing}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <CreateBusinessForm />
    </AuthShell>
  );
}
