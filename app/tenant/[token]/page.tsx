/**
 * 입주자 셀프 조회(QR) 공개 페이지 `/tenant/<건물 QR 토큰>` — 로그인 없이 열린다(middleware PUBLIC_PREFIXES "/tenant").
 * 서버 함수 호출은 전부 클라이언트(server action)에서 한다: RSC 렌더 중에는 쿠키를 지울 수 없는데
 * portalRpc 는 session_invalid·portal_off 때 세션 쿠키를 지운다(lib/domain/building-portal.ts).
 * 토큰이 주소에 있으므로 검색 노출·Referer 전송을 막는다.
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { TenantPortal } from "@/components/tenant-portal/TenantPortal";

export const metadata: Metadata = {
  title: "관리비 조회 | NURI CRM",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default function TenantPage({ params }: { params: { token: string } }) {
  return (
    <Suspense fallback={null}>
      <TenantPortal token={decodeURIComponent(params.token)} />
    </Suspense>
  );
}
