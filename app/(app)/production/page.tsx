"use client";

import Link from "next/link";
import { IconScan } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ActionButton } from "@/components/common/ActionButton";
import { KanbanBoard } from "@/components/production/KanbanBoard";

export default function ProductionPage() {
  return (
    <>
      <Topbar title="생산 현황">
        <Link href="/production/scan">
          <ActionButton>
            <IconScan size={14} />
            QR 스캔
          </ActionButton>
        </Link>
        <ThemeToggle />
      </Topbar>
      <PageContent noPadding noScroll>
        <KanbanBoard />
      </PageContent>
    </>
  );
}
