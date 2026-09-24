"use client";

import { useState } from "react";
import { IconRulerOff } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SearchInput } from "@/components/common/SearchInput";
import { MTMCard } from "@/components/mtm/MTMCard";
import { useCustomerStore } from "@/lib/stores/customerStore";

export default function MTMPage() {
  const customers = useCustomerStore((s) => s.customers);
  const [q, setQ] = useState("");

  const filtered = q
    ? customers.filter((c) => c.name.includes(q) || c.phone.includes(q))
    : customers;

  return (
    <>
      <Topbar title="MTM 치수 카드">
        <SearchInput value={q} onChange={setQ} placeholder="이름 또는 전화번호 검색…" />
        <ThemeToggle />
      </Topbar>
      <PageContent>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-t3 text-sm">
            <IconRulerOff size={32} className="mx-auto opacity-30 mb-2" />
            검색 결과가 없습니다
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(268px, 1fr))" }}>
            {filtered.map((c) => (
              <MTMCard key={c.name} customer={c} />
            ))}
          </div>
        )}
      </PageContent>
    </>
  );
}
