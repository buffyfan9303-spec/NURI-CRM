/**
 * "materials" 경로는 공장·학원 공용이다(코디네이터 지시) — 같은 테이블·컴포넌트를 쓰고
 * 라벨만 업종에 따라 바꾼다(공장="자재", 학원="교재·교구").
 */
import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { RetryButton } from "@/components/rental/listkit";
import { accessMessage } from "@/lib/auth/access";
import { listMaterials } from "@/lib/domain/materials";
import { getAccess } from "../access";
import { MaterialsBoard } from "@/components/academy/MaterialsBoard";

export default async function MaterialsPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }

  if (access.industry !== "factory" && access.industry !== "academy") {
    return (
      <PageBody>
        <PageHeader title="자재 재고" />
        <Card><EmptyState title="이 업종에는 자재 화면이 없습니다." /></Card>
      </PageBody>
    );
  }

  const canReadCost = access.caps.includes("cost.read");
  const result = await listMaterials(access.businessId, canReadCost);
  const label = access.industry === "factory" ? "자재" : "교재·교구";
  if (!result.ok) return <PageBody><PageHeader title={`${label} 재고`} /><Card><ErrorState title="불러오지 못했습니다." description={result.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;

  return (
    <PageBody>
      <MaterialsBoard
        businessId={access.businessId}
        canWrite={access.caps.includes("write")}
        canAdjust={access.caps.includes("inventory.adjust")}
        canReadCost={canReadCost}
        materials={result.data}
        labelKind={label}
        industry={access.industry}
      />
    </PageBody>
  );
}
