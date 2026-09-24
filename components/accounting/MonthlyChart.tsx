"use client";

import { IconChartBar, IconSquare } from "@tabler/icons-react";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { parsePriceString } from "@/lib/utils/price";
import { parseOrdDate } from "@/lib/utils/dday";
import { cn } from "@/lib/utils/cn";

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const CURRENT_MONTH_INDEX = 4; // 2026.05

export function MonthlyChart() {
  const flatten = useCustomerStore((s) => s.flattenOrders);
  const rows = flatten();

  const monthly = new Array(12).fill(0) as number[];
  for (const r of rows) {
    const d = parseOrdDate(r.order.ord);
    if (!d || d.getFullYear() !== 2026) continue;
    monthly[d.getMonth()] += parsePriceString(r.order.price);
  }
  const max = Math.max(...monthly) || 1;
  const totalRev = monthly.reduce((a, v) => a + v, 0);

  return (
    <div className="bg-sf border border-bd rounded-xl p-5 mb-3.5 shadow-card">
      <div className="text-[13px] font-extrabold text-t mb-3.5 tracking-tight flex items-center gap-2">
        <IconChartBar size={15} className="text-gold" />
        월별 매출 추이 (2026년)
      </div>

      <div className="grid grid-cols-12 gap-2 items-end h-[160px] py-2 border-b border-bd">
        {monthly.map((v, i) => {
          const heightPct = Math.round((v / max) * 100);
          const isCurrent = i === CURRENT_MONTH_INDEX;
          const manwon = Math.round(v / 10000);
          return (
            <div
              key={i}
              className="flex flex-col items-center justify-end h-full cursor-pointer relative group"
              title={`${MONTHS[i]}: ₩${v.toLocaleString()}`}
            >
              <div className="flex-1 flex flex-col justify-end w-full items-center">
                {v > 0 && (
                  <div className="text-[9px] text-t3 font-bold mb-1 text-center group-hover:text-t">
                    {manwon.toLocaleString()}
                  </div>
                )}
                <div
                  className={cn(
                    "w-full max-w-[32px] rounded-t-[5px] min-h-[3px] transition-all group-hover:opacity-85 group-hover:-translate-y-0.5",
                    isCurrent
                      ? "bg-gradient-to-b from-acc to-[#061222]"
                      : "bg-gradient-to-b from-gold to-[#a67838]"
                  )}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <div className="text-[9px] text-t3 font-semibold mt-1.5">
                {MONTHS[i]}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center mt-3 text-[10px] text-t3">
        <span className="flex items-center gap-1">
          <IconSquare size={10} className="text-gold fill-gold" />
          매출 (단위: 만원)
        </span>
        <span>전체: ₩{totalRev.toLocaleString()}</span>
      </div>
    </div>
  );
}
