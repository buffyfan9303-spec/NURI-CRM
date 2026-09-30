/**
 * 입주자 조회(QR) 화면 모의 렌더 — 서버 함수 대신 가짜 데이터로 화면·상태만 확인한다(운영 DB 호출 없음).
 * 0035 가 운영 DB 에 적용되기 전 화면 실측용. 운영 빌드에서는 404.
 * ?mode=login(기본) | home | off | link | admin | admin-off   · 로그인 모의: 코드 WRONG0000=틀림, LOCK0000=잠김, 그 밖 8자=성공
 */
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TenantPreview } from "./TenantPreview";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { mode?: string } }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <TenantPreview mode={searchParams.mode ?? "login"} />
    </Suspense>
  );
}
