"use client";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { OrderForm } from "@/components/order/OrderForm";

export default function OrderNewPage() {
  return (
    <>
      <Topbar title="주문 등록">
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <OrderForm editing={null} />
      </PageContent>
    </>
  );
}
