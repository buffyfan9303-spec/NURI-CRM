"use client";

import { IconBuilding } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { FormCard, FormCardTitle } from "@/components/common/Form";
import { AdminStats } from "@/components/admin/AdminStats";
import { BusinessApprovalTable } from "@/components/admin/BusinessApprovalTable";
import { BasePriceConfig } from "@/components/admin/BasePriceConfig";

export default function AdminPage() {
  return (
    <RoleGuard allow={["admin"]}>
      <Topbar title="관리자 설정">
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <AdminStats />

        <FormCard>
          <FormCardTitle icon={<IconBuilding size={17} className="text-acc" />}>
            업체 승인 관리
          </FormCardTitle>
          <BusinessApprovalTable />
        </FormCard>

        <BasePriceConfig />
      </PageContent>
    </RoleGuard>
  );
}
