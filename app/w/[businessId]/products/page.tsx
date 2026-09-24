import { Card } from "@/components/ui/Card";
import { PageBody } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage } from "@/lib/auth/access";
import { listProducts } from "@/lib/domain/unmanned";
import { getAccess } from "../access";
import { ProductsBoard } from "@/components/unmanned/ProductsBoard";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams: { low?: string };
}) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }

  if (access.industry !== "unmanned") {
    return (
      <PageBody>
        <Card>
          <EmptyState title="이 업종에는 상품·바코드 화면이 없습니다." />
        </Card>
      </PageBody>
    );
  }
  const canReadCost = access.caps.includes("cost.read");
  const result = await listProducts(access.businessId, canReadCost);
  if (!result.ok) {
    return <PageBody><Card><ErrorState title="상품을 불러오지 못했습니다." description={result.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
  }
  // 홈 "부족재고" 지표에서 넘어오면 부족 재고 상품만 좁힌다.
  const products = searchParams.low === "1" ? result.data.filter((p) => p.lowStock) : result.data;
  return (
    <PageBody>
      <ProductsBoard businessId={access.businessId} canWrite={access.caps.includes("write")} canReadCost={canReadCost} products={products} lowOnly={searchParams.low === "1"} />
    </PageBody>
  );
}
