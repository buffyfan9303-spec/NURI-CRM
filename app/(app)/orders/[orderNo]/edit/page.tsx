"use client";
import { useParams } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { OrderForm } from "@/components/order/OrderForm";
import { useCustomerStore } from "@/lib/stores/customerStore";

export default function OrderEditPage() {
  const params = useParams<{ orderNo: string }>();
  const orderNo = decodeURIComponent(params.orderNo);
  const findOrder = useCustomerStore((s) => s.findOrder);
  const found = findOrder(orderNo);

  return (
    <>
      <Topbar title="주문 수정">
        <ThemeToggle />
      </Topbar>
      <PageContent>
        {found ? (
          <OrderForm editing={{ orderNo, customerName: found.customer.name }} />
        ) : (
          <div className="text-t3 text-sm py-10 text-center">
            주문 {orderNo} 을(를) 찾을 수 없습니다.
          </div>
        )}
      </PageContent>
    </>
  );
}
