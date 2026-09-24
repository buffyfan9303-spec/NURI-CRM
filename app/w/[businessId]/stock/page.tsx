/**
 * "stock" 경로는 업종에 따라 화면이 완전히 다르다(config.ts 나비게이션이 같은 path를 공유):
 *   - 무인매장: 재고조정·실사·대사 (crm.us_*)
 *   - 미용실: 상품·소모품 재고 (crm.salon_retail_*)
 * 라우팅은 businessId 단위라 파일이 하나뿐이다 — industry로 분기한다(업종은 권한 근거가
 * 아니지만 여기서는 "어떤 화면을 보여줄지"만 결정할 뿐 권한 판정에는 쓰지 않는다).
 */
import { Card } from "@/components/ui/Card";
import { PageBody } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage } from "@/lib/auth/access";
import { listProducts, listReconciliation, listStockTakes, listStockTakeLines, getLossReport, getReorderSuggestions, listExpiringLots, reorderMessage } from "@/lib/domain/unmanned";
import { todayKeyInTz } from "@/lib/utils/datetime";
import { listRetailItems } from "@/lib/domain/salon";
import { getAccess } from "../access";
import { StockBoard } from "@/components/unmanned/StockBoard";
import { RetailBoard } from "@/components/salon/RetailBoard";

export default async function StockPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }

  if (access.industry === "salon") {
    const items = await listRetailItems(access.businessId);
    if (!items.ok) return <PageBody><Card><ErrorState title="불러오지 못했습니다." description={items.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
    // 미용실 분기만 — 제목·설명·CTA 는 RetailBoard 의 PageHeader 가 그린다(2단계 디자인).
    return (
      <PageBody>
        <RetailBoard businessId={access.businessId} canWrite={access.caps.includes("write")} canAdjust={access.caps.includes("inventory.adjust")} items={items.data} />
      </PageBody>
    );
  }

  if (access.industry === "unmanned") {
    const todayKey = todayKeyInTz(access.timezone);
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const [products, reconciliation, takes, loss, reorder, expiring] = await Promise.all([
      listProducts(access.businessId, access.caps.includes("cost.read")),
      listReconciliation(access.businessId),
      listStockTakes(access.businessId),
      // 금액은 서버 RPC 가 cost.read/revenue.read 로 각각 null 처리한다(화면은 "비공개"로 표시).
      getLossReport(access.businessId, from, todayKey),
      getReorderSuggestions(access.businessId),
      listExpiringLots(access.businessId, 7),
    ]);
    if (!products.ok) return <PageBody><Card><ErrorState title="불러오지 못했습니다." description={products.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
    if (!reconciliation.ok) return <PageBody><Card><ErrorState title="불러오지 못했습니다." description={reconciliation.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
    if (!takes.ok) return <PageBody><Card><ErrorState title="불러오지 못했습니다." description={takes.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
    const open = takes.data.find((t) => t.status === "진행중") ?? null;
    const lines = open ? await listStockTakeLines(open.id) : { ok: true as const, data: [] };
    if (!lines.ok) return <PageBody><Card><ErrorState title="불러오지 못했습니다." description={lines.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
    return (
      <PageBody>
        <StockBoard
          businessId={access.businessId}
          canAdjust={access.caps.includes("inventory.adjust")}
          products={products.data}
          reconciliation={reconciliation.data}
          openTake={open}
          openTakeLines={lines.data}
          businessName={access.businessName}
          todayKey={todayKey}
          loss={loss.ok ? loss.data : null}
          reorder={reorder.ok ? reorder.data : null}
          reorderText={reorderMessage(access.businessName, reorder.ok ? reorder.data : [])}
          expiring={expiring.ok ? expiring.data : []}
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <Card><EmptyState title="이 업종에는 재고 화면이 없습니다." /></Card>
    </PageBody>
  );
}
