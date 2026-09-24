/**
 * 상품(스타일) → SKU(색상×사이즈) → 개체(실물 1점) 3계층.
 * 취득비용은 cost.read 없으면 아예 조회하지 않는다(화면도 요청하지 말 것 — 지시사항).
 */
import { Card } from "@/components/ui/Card";
import { PageBody } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage } from "@/lib/auth/access";
import { listProducts, getUnitCosts, getUnitRentalCounts } from "@/lib/domain/rental";
import { getAccess } from "../access";
import { CatalogView } from "@/components/rental/CatalogView";

export default async function CatalogPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return (
      <PageBody>
        <Card>
          {access.reason === "forbidden" ? (
            <ForbiddenState title={msg.title} description={msg.detail} />
          ) : (
            <ErrorState title={msg.title} description={msg.detail} />
          )}
        </Card>
      </PageBody>
    );
  }

  if (access.industry !== "rental") {
    return (
      <PageBody>
        <Card>
          <EmptyState title="이 업종에는 상품·개체 화면이 없습니다." />
        </Card>
      </PageBody>
    );
  }

  const result = await listProducts(access.businessId);
  if (!result.ok) {
    return (
      <PageBody>
        <Card>
          <ErrorState title="상품 목록을 불러오지 못했습니다." description={result.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  const allUnitIds = result.data.flatMap((p) => p.skus.flatMap((s) => s.units.map((u) => u.id)));
  const canReadCost = access.caps.includes("cost.read");
  const [costs, counts] = await Promise.all([
    canReadCost ? getUnitCosts(access.businessId, allUnitIds) : Promise.resolve({}),
    getUnitRentalCounts(access.businessId, allUnitIds),
  ]);

  return (
    <PageBody wide>
      <CatalogView
        businessId={access.businessId}
        products={result.data}
        unitCosts={costs}
        unitRentalCounts={counts}
        canReadCost={canReadCost}
        canWrite={access.caps.includes("write")}
      />
    </PageBody>
  );
}
