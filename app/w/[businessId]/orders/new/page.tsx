import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { listCustomers } from "@/lib/domain/rental";
import { listMaterials } from "@/lib/domain/factory";
import { getAccess } from "../../access";
import { OrderForm } from "@/components/factory/OrderForm";

export default async function NewFactoryOrderPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "write");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    if (access.reason === "not-member") redirect("/select");
    const msg = accessMessage(access);
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          {access.reason === "forbidden" ? (
            <ForbiddenState title={msg.title} description={msg.detail} />
          ) : (
            <ErrorState title={msg.title} description={msg.detail} />
          )}
        </Card>
      </div>
    );
  }

  const [customersRes, fabricsRes, liningsRes, buttonsRes] = await Promise.all([
    listCustomers(access.businessId),
    listMaterials(access.businessId, "fabric"),
    listMaterials(access.businessId, "lining"),
    listMaterials(access.businessId, "button"),
  ]);

  if (!customersRes.ok) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ErrorState title="고객 목록을 불러오지 못했습니다." description={customersRes.message} />
        </Card>
      </div>
    );
  }

  const vatRate = Number((access.settings as { vat_rate?: number })?.vat_rate ?? 0.1);

  return (
    <div className="mx-auto max-w-[1600px] p-4 md:p-6">
      <h1 className="mb-4 text-[18px] font-semibold text-t">새 주문 등록</h1>
      <OrderForm
        businessId={access.businessId}
        customers={customersRes.data}
        fabrics={fabricsRes.ok ? fabricsRes.data : []}
        linings={liningsRes.ok ? liningsRes.data : []}
        buttons={buttonsRes.ok ? buttonsRes.data : []}
        vatRate={vatRate}
        canAdjustInventory={access.caps.includes("inventory.adjust")}
      />
    </div>
  );
}
