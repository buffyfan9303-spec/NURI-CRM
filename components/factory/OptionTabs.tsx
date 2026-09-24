"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import {
  FACTORY_OPTION_GROUPS,
  FACTORY_QTY_FIELDS,
  fieldsByGroup,
  type OptionValue,
} from "@/lib/domain/factory-options";
import { OptionField } from "./OptionField";

/**
 * 정장 옵션 41항목 탭 폼 — 일정/수량, 상의16, 패턴수정2, 하의10, 조끼5, 기타4.
 * "일정/수량" 탭은 qty(jsonb)로, 나머지는 options(jsonb)로 저장 대상이 갈린다
 * (0007_factory.sql: factory_orders.options / .qty 두 컬럼).
 */
export function OptionTabs({
  options,
  qty,
  onOptionsChange,
  onQtyChange,
  activeGroup,
  onActiveGroupChange,
}: {
  options: Record<string, OptionValue>;
  qty: Record<string, number>;
  onOptionsChange: (key: string, value: unknown) => void;
  onQtyChange: (key: string, value: number) => void;
  /** 미리보기 핫스폿 클릭으로 특정 그룹 탭을 강제 전환할 때 쓴다(제어형). 생략 시 내부 상태로 동작. */
  activeGroup?: (typeof FACTORY_OPTION_GROUPS)[number];
  onActiveGroupChange?: (g: (typeof FACTORY_OPTION_GROUPS)[number]) => void;
}) {
  const [internalTab, setInternalTab] = React.useState<(typeof FACTORY_OPTION_GROUPS)[number]>("일정/수량");
  const tab = activeGroup ?? internalTab;
  const setTab = onActiveGroupChange ?? setInternalTab;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--bd)]">
        {FACTORY_OPTION_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setTab(g)}
            className={cn(
              "min-h-[44px] rounded-t-[var(--r-md)] px-3.5 text-[13px] font-medium",
              tab === g ? "border-b-2 border-[var(--accent)] text-t" : "text-t3 hover:text-t2"
            )}
          >
            {g}
          </button>
        ))}
      </div>

      {tab === "일정/수량" ? (
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 md:grid-cols-4">
          {FACTORY_QTY_FIELDS.map((f) => (
            <OptionField
              key={f.key}
              def={f}
              value={qty[f.key]}
              onChange={(k, v) => onQtyChange(k, Number(v))}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 md:grid-cols-3">
          {fieldsByGroup(tab).map((f) => (
            <OptionField key={f.key} def={f} value={options[f.key]} onChange={onOptionsChange} />
          ))}
        </div>
      )}
    </div>
  );
}
