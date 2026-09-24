"use client";

import { useState } from "react";
import {
  IconBuilding,
  IconCircleCheck,
  IconStack,
  IconSearchOff,
} from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SearchInput } from "@/components/common/SearchInput";
import { StatCard } from "@/components/common/StatCard";
import { VendorCard } from "@/components/vendor/VendorCard";
import { useBusinessStore } from "@/lib/stores/businessStore";
import { useFabricStore } from "@/lib/stores/fabricStore";

export default function FabVendorsPage() {
  const businesses = useBusinessStore((s) => s.businesses);
  const fabrics = useFabricStore((s) => s.fabrics);
  const [q, setQ] = useState("");

  const vendors = businesses.filter((b) => b.type === "fabric_store");
  const filtered = q ? vendors.filter((b) => b.name.includes(q)) : vendors;

  return (
    <>
      <Topbar title="원단 거래처">
        <SearchInput value={q} onChange={setQ} placeholder="거래처명 검색…" width={200} />
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-[18px]">
          <StatCard variant="c1" Icon={IconBuilding}    label="총 거래처"   value={vendors.length} note="등록된 원단 업체" />
          <StatCard variant="c3" Icon={IconCircleCheck} label="활성 거래처" value={vendors.filter((b) => b.approved).length} note="정상 거래중" noteVariant="up" />
          <StatCard variant="c2" Icon={IconStack}       label="취급 원단"   value={fabrics.length} note="전체 품목 수" />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-t3 text-sm">
            <IconSearchOff size={32} className="mx-auto opacity-30 mb-2" />
            검색 결과가 없습니다
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {filtered.map((b) => (
              <VendorCard key={b.id} business={b} />
            ))}
          </div>
        )}
      </PageContent>
    </>
  );
}
