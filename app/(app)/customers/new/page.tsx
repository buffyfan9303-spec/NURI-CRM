"use client";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { CustomerRegisterForm } from "@/components/customer/CustomerRegisterForm";

export default function CustomerRegisterPage() {
  return (
    <>
      <Topbar title="고객 등록">
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <CustomerRegisterForm />
      </PageContent>
    </>
  );
}
