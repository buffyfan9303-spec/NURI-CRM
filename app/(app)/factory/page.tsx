"use client";

import { IconCircleCheck, IconCircleX } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useBusinessStore } from "@/lib/stores/businessStore";
import { SEED_FACTORY_EXTRA } from "@/lib/data/seed";
import { BUSINESS_TYPE_LABEL } from "@/types/business";

export default function FactoryPage() {
  const businesses = useBusinessStore((s) => s.businesses);
  const list = businesses.filter(
    (b) => b.type === "factory" || b.type === "fabric_store"
  );

  return (
    <>
      <Topbar title="공장 관리">
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <div className="bg-sf border border-bd rounded-xl overflow-x-auto shadow-card scrollable">
          <table className="w-full border-collapse table-fixed min-w-[760px]">
            <thead>
              <tr>
                <Th width="20%">업체명</Th>
                <Th width="18%">유형</Th>
                <Th width="18%">월간 CAPA</Th>
                <Th width="24%">주요 취급 품목</Th>
                <Th width="12%">상태</Th>
                <Th width="8%">승인</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const ex = SEED_FACTORY_EXTRA[b.id] ?? { capa: "—", items: "—" };
                return (
                  <tr key={b.id}>
                    <Td><span className="font-bold">{b.name}</span></Td>
                    <Td><span className="badge b-info" style={{ fontSize: 10 }}>{BUSINESS_TYPE_LABEL[b.type]}</span></Td>
                    <Td>{ex.capa}</Td>
                    <Td>{ex.items}</Td>
                    <Td>
                      <span className={`badge ${b.approved ? "b-ok" : "b-err"}`}>
                        {b.approved ? "거래중" : "정지"}
                      </span>
                    </Td>
                    <Td>
                      <div className="text-center">
                        {b.approved
                          ? <IconCircleCheck size={16} className="text-okt mx-auto" />
                          : <IconCircleX size={16} className="text-et mx-auto" />}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageContent>
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
