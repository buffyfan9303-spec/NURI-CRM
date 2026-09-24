import { Card } from "@/components/ui/Card";
import { PageBody } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage } from "@/lib/auth/access";
import { listProducts, listSalesRecords } from "@/lib/domain/unmanned";
import { getAccess } from "../access";
import { SalesBoard } from "@/components/unmanned/SalesBoard";

export default async function SalesPage({ params }: { params: { businessId: string } }) {
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
          <EmptyState title="이 업종에는 매출 기록 화면이 없습니다." />
        </Card>
      </PageBody>
    );
  }
  const [products, records] = await Promise.all([
    listProducts(access.businessId, false),
    listSalesRecords(access.businessId),
  ]);
  if (!products.ok) return <PageBody><Card><ErrorState title="불러오지 못했습니다." description={products.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
  if (!records.ok) return <PageBody><Card><ErrorState title="불러오지 못했습니다." description={records.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;

  return (
    <PageBody>
      <SalesBoard
        businessId={access.businessId}
        canWrite={access.caps.includes("write")}
        canReadRevenue={access.caps.includes("revenue.read")}
        products={products.data}
        records={records.data}
      />
    </PageBody>
  );
}
