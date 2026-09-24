import * as React from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

/** 약관 문서 공통 틀 — 인증 셸의 넓은 카드 안에 읽기 좋은 본문 타이포만 얹는다. */
export function LegalDoc({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <AuthShell width="wide">
      <article className="text-[14px] leading-[1.75] text-auth-tx [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-[16px] [&_h2]:font-bold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        <p className="!mt-2 text-[13px] text-auth-tx2">시행일 {updated}</p>
        {children}
        <p className="!mt-10">
          <Link href="/login" className="inline-flex min-h-[44px] items-center font-semibold text-[var(--auth-accent)] underline-offset-4 hover:underline">
            ← 로그인으로 돌아가기
          </Link>
        </p>
      </article>
    </AuthShell>
  );
}

/** 운영자/책임자 정보가 아직 없을 때 쓰는 문구. */
export function Pending({ children }: { children?: React.ReactNode }) {
  return <span className="text-auth-tx2">{children ?? "등록 예정"}</span>;
}
