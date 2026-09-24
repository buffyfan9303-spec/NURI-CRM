"use client";

import { useBusinessStore } from "@/lib/stores/businessStore";
import { useToastStore } from "@/lib/stores/toastStore";
import { BUSINESS_TYPE_LABEL } from "@/types/business";

export function BusinessApprovalTable() {
  const businesses = useBusinessStore((s) => s.businesses);
  const setApproved = useBusinessStore((s) => s.setApproved);
  const showToast = useToastStore((s) => s.show);

  const onToggle = (id: string, val: boolean) => {
    setApproved(id, val);
    const b = businesses.find((x) => x.id === id);
    if (b)
      showToast(
        "업체 상태 변경",
        `${b.name} — ${val ? "승인" : "미승인"}으로 변경되었습니다.`,
        val ? "ok" : "warn"
      );
  };

  return (
    <div className="bg-sf border border-bd rounded-lg overflow-x-auto scrollable">
      <table className="w-full border-collapse table-fixed min-w-[600px]">
        <thead>
          <tr>
            <Th width="25%">업체명</Th>
            <Th width="18%">유형</Th>
            <Th width="18%">승인 상태</Th>
            <Th width="39%">승인 토글</Th>
          </tr>
        </thead>
        <tbody>
          {businesses.map((b) => (
            <tr key={b.id}>
              <Td><span className="font-bold">{b.name}</span></Td>
              <Td><span className="badge b-info" style={{ fontSize: 10 }}>{BUSINESS_TYPE_LABEL[b.type]}</span></Td>
              <Td><span className={`badge ${b.approved ? "b-ok" : "b-err"}`}>{b.approved ? "승인" : "미승인"}</span></Td>
              <Td>
                <label className="relative inline-block w-[38px] h-[22px] align-middle cursor-pointer">
                  <input
                    type="checkbox"
                    checked={b.approved}
                    onChange={(e) => onToggle(b.id, e.target.checked)}
                    className="opacity-0 absolute w-0 h-0 peer"
                  />
                  <span className="absolute inset-0 bg-t3 rounded-full transition peer-checked:bg-okt
                    before:content-[''] before:absolute before:h-4 before:w-4 before:left-[3px] before:bottom-[3px]
                    before:bg-white before:rounded-full before:transition peer-checked:before:translate-x-4" />
                </label>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
