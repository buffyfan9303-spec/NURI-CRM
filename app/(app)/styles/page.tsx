"use client";

import { useState } from "react";
import { IconBookOff } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SearchInput } from "@/components/common/SearchInput";
import { StyleCard } from "@/components/style/StyleCard";
import { SEED_STYLES } from "@/lib/data/seed";

export default function StylesPage() {
  const [q, setQ] = useState("");
  const filtered = q
    ? SEED_STYLES.filter((s) =>
        s.name.includes(q) ||
        s.cat.includes(q) ||
        s.tags.some((t) => t.includes(q))
      )
    : SEED_STYLES;

  return (
    <>
      <Topbar title="스타일 북">
        <SearchInput value={q} onChange={setQ} placeholder="스타일 검색…" width={200} />
        <ThemeToggle />
      </Topbar>
      <PageContent>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-t3 text-sm">
            <IconBookOff size={32} className="mx-auto opacity-30 mb-2" />
            검색 결과가 없습니다
          </div>
        ) : (
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(224px, 1fr))" }}>
            {filtered.map((s) => (
              <StyleCard key={s.id} style={s} />
            ))}
          </div>
        )}
      </PageContent>
    </>
  );
}
