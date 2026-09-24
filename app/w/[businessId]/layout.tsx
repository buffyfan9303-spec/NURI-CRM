/**
 * 업종 작업공간 셸. 접근 판정은 여기서 서버가 한다(계약 §5).
 * unauthenticated → 로그인, not-member → 전용 화면(다른 사업장으로 조용히 넘기지 않는다),
 * forbidden → ForbiddenState, error → ErrorState(재시도).
 */
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { listMyBusinesses } from "@/lib/auth/actions";
import { INDUSTRY_DEFS } from "@/lib/industry/config";
import { WorkspaceShell } from "@/components/shell/WorkspaceShell";
import { getAccess } from "./access";

const ROLE_LABEL: Record<string, string> = {
  owner: "대표",
  manager: "매니저",
  staff: "직원",
  accountant: "회계",
  viewer: "열람",
};

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { businessId: string };
}) {
  const access = await getAccess(params.businessId, "view");

  if (!access.ok) {
    if (access.reason === "unauthenticated") {
      redirect(`/login?from=/w/${params.businessId}`);
    }

    const msg = accessMessage(access);

    // 레퍼런스 §8: 인증 세계는 **외곽 카드가 없다**. 웜톤 배경이 내용 사이로 계속 보여야 한다.
    // 예전에는 여기서 AuthShell 안에 흰 Card 를 넣어 그 배경 위에 흰 사각형이 떴다.
    if (access.reason === "not-member") {
      return (
        <AuthShell>
          <div className="flex flex-col items-center gap-3 px-6 py-4 text-center">
            <h1 className="text-[20px] font-bold text-auth-tx">{msg.title}</h1>
            <p className="max-w-[340px] text-[13px] leading-relaxed text-auth-tx2">{msg.detail}</p>
            <form action={async () => { "use server"; redirect("/select"); }} className="mt-2">
              <button
                type="submit"
                className="min-h-[44px] rounded-full border border-auth-field-bd bg-auth-field px-6 text-[14px] font-medium text-auth-tx transition-colors hover:bg-white/20"
              >
                내 사업장 목록으로
              </button>
            </form>
          </div>
        </AuthShell>
      );
    }

    if (access.reason === "forbidden") {
      return (
        <AuthShell>
          <div className="px-6 py-4 text-auth-tx [&_p]:text-auth-tx2">
            <ForbiddenState title={msg.title} description={msg.detail} />
          </div>
        </AuthShell>
      );
    }

    // error — 빈 화면으로 덮지 않는다.
    return (
      <AuthShell>
        <div className="px-6 py-4 text-auth-tx [&_p]:text-auth-tx2">
          <ErrorState title={msg.title} description={msg.detail} />
        </div>
      </AuthShell>
    );
  }

  const def = INDUSTRY_DEFS[access.industry];
  const nav = def.nav.filter((item) => access.caps.includes(item.cap as (typeof access.caps)[number]));

  const bizList = await listMyBusinesses();
  const myBusinesses = bizList.ok ? bizList.businesses : [];

  return (
    <WorkspaceShell
      businessId={access.businessId}
      businessName={access.businessName}
      industry={access.industry}
      roleLabel={ROLE_LABEL[access.role] ?? access.role}
      userEmail={access.email}
      nav={nav}
      myBusinesses={myBusinesses}
      canWrite={access.caps.includes("write")}
    >
      {children}
    </WorkspaceShell>
  );
}
