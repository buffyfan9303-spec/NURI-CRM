/**
 * 인증 가드.
 * persist hydration 이후 isAuthenticated=false 면 /login 으로 replace.
 * 그 전에는 null 을 반환해 플래시를 방지한다.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { useHasHydrated } from "@/hooks/useHasHydrated";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
