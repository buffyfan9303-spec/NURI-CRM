/**
 * 역할별 페이지 가드.
 *   <RoleGuard allow={["admin"]} fallback={<>...</>}>
 *     <AdminContent />
 *   </RoleGuard>
 *
 * 거부 시 토스트 + 대시보드로 복귀하는 동작은 useEffect 로 처리.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { useToastStore } from "@/lib/stores/toastStore";
import { useHasHydrated } from "@/hooks/useHasHydrated";
import type { Role } from "@/types/auth";

interface RoleGuardProps {
  allow: Role[];
  redirectTo?: string;
  children: React.ReactNode;
}

export function RoleGuard({ allow, redirectTo = "/dashboard", children }: RoleGuardProps) {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const role = useAuthStore((s) => s.user.role);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    if (!hydrated) return;
    if (!allow.includes(role)) {
      showToast("접근 거부", "이 페이지에 접근할 권한이 없습니다.", "warn");
      router.replace(redirectTo);
    }
  }, [hydrated, role, allow, redirectTo, router, showToast]);

  if (!hydrated || !allow.includes(role)) {
    return null;
  }

  return <>{children}</>;
}
