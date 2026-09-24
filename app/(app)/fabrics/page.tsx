"use client";

import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ActionButton } from "@/components/common/ActionButton";
import { FabricEditModal } from "@/components/fabric/FabricEditModal";
import { useFabricStore } from "@/lib/stores/fabricStore";
import { useBusinessStore } from "@/lib/stores/businessStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils/cn";
import type { FabricStatus } from "@/types/fabric";

const BADGE: Record<FabricStatus, string> = {
  여유: "b-ok",
  부족: "b-warn",
  매진: "b-err",
};

export default function FabricsPage() {
  const role = useAuthStore((s) => s.user.role);
  const businessId = useAuthStore((s) => s.user.businessId);
  const fabrics = useFabricStore((s) => s.fabrics);
  const removeFab = useFabricStore((s) => s.remove);
  const businesses = useBusinessStore((s) => s.businesses);
  const [editing, setEditing] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const list =
    role === "admin"
      ? fabrics
      : fabrics.filter((f) => f.businessId === businessId);

  const openEdit = (id: string | null) => {
    setEditing(id);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm("이 원단을 삭제하시겠습니까?")) return;
    removeFab(id);
  };

  return (
    <>
      <Topbar title="원단 재고">
        <ActionButton onClick={() => openEdit(null)}>
          <IconPlus size={14} />
          원단 추가
        </ActionButton>
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <div className="bg-sf border border-bd rounded-xl overflow-x-auto shadow-card scrollable">
          <table className="w-full border-collapse table-fixed min-w-[720px]">
            <thead>
              <tr>
                <Th width="22%">원단명</Th>
                <Th width="14%">업체</Th>
                <Th width="10%">재고량</Th>
                <Th width="12%">단가</Th>
                <Th width="10%">색상</Th>
                <Th width="12%">상태</Th>
                <Th width="20%">관리</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((f) => {
                const biz = businesses.find((b) => b.id === f.businessId);
                const rowHighlight =
                  f.status === "매진" ? "!bg-eb/30 !text-et"
                  : f.status === "부족" ? "!bg-wb/30"
                  : "";
                return (
                  <tr key={f.id} className={cn("transition-colors hover:bg-sf2", rowHighlight)}>
                    <Td><span className="font-bold">{f.name}</span></Td>
                    <Td>{biz?.name ?? ""}</Td>
                    <Td><span className="font-bold">{f.qty}m</span></Td>
                    <Td>₩{f.price.toLocaleString()}</Td>
                    <Td>{f.color}</Td>
                    <Td><span className={`badge ${BADGE[f.status]}`}>{f.status}</span></Td>
                    <Td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(f.id)}
                          className="py-1 px-2.5 text-[11px] border border-bd2 rounded-md bg-transparent text-t hover:bg-sf2 cursor-pointer transition-colors"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(f.id)}
                          className="py-1 px-2.5 text-[11px] border border-eb rounded-md bg-transparent text-et hover:bg-eb cursor-pointer transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageContent>
      {modalOpen && (
        <FabricEditModal fabricId={editing} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

function Th({ children, width }: { children: React.ReactNode; width: string }) {
  return (
    <th style={{ width }} className="py-3 px-4 text-[10px] font-bold text-t2 text-left bg-sf2 border-b border-bd uppercase tracking-[.8px]">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-3 px-4 text-[13px] border-b border-bd text-t last:border-b-0">{children}</td>;
}
