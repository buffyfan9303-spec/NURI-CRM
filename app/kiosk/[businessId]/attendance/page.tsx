/**
 * 등원 코드 키오스크(0023 A4) — 전용 전체 화면 라우트.
 *
 * 디자인 재검증 #12: 예전에는 `/w/{businessId}/attendance/kiosk` 아래에 있어서
 * WorkspaceShell(사이드바·계정 메뉴·"+ 수강 등록")이 학생용 태블릿 화면에도 그대로 노출됐다.
 * `/w/**`의 하위 경로는 app/w/[businessId]/layout.tsx가 항상 셸을 씌우므로, 셸을 벗어나려면
 * `/w` 밖의 최상위 라우트로 옮겨야 한다 — 그래서 여기(app/kiosk/**)로 분리한다.
 *
 * 권한: getAccess와 동일한 서버 판정(lib/auth/access.checkAccess)을 그대로 쓴다. 인증·write cap
 * 검사는 셸 유무와 무관하게 유지된다(여기서 우회하지 않는다).
 */
import { checkAccess } from "@/lib/auth/access";
import { accessMessage } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckinKiosk } from "@/components/academy/CheckinKiosk";
import { KioskExit } from "./KioskExit";

export default async function KioskAttendancePage({ params }: { params: { businessId: string } }) {
  const access = await checkAccess(params.businessId, "write");

  if (!access.ok) {
    if (access.reason === "unauthenticated") {
      redirect(`/login?from=/kiosk/${params.businessId}/attendance`);
    }
    const msg = accessMessage(access);
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
        <Card className="max-w-[440px]">
          {access.reason === "forbidden" ? (
            <ForbiddenState title={msg.title} description={msg.detail} />
          ) : (
            <ErrorState title={msg.title} description={msg.detail} />
          )}
        </Card>
      </div>
    );
  }

  if (access.industry !== "academy") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
        <Card className="max-w-[440px]">
          <EmptyState title="이 업종에는 등원 키오스크 화면이 없습니다." />
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-6">
      <KioskExit businessId={access.businessId} />
      <CheckinKiosk businessId={access.businessId} businessName={access.businessName} />
    </div>
  );
}
