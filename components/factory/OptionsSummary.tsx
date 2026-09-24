import {
  FACTORY_OPTION_GROUPS,
  FACTORY_QTY_FIELDS,
  fieldsByGroup,
  type OptionValue,
} from "@/lib/domain/factory-options";

/**
 * 41항목 읽기 전용 요약(그룹별 라벨:값). OrderDetail의 비편집 뷰와
 * components/garment 미리보기 우측 "현재 제작 사양" 패널이 공유한다(중복 제거).
 */
export function OptionsSummary({
  options, qty, dense,
}: {
  options: Record<string, OptionValue>;
  qty: Record<string, number>;
  dense?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className={dense ? "grid grid-cols-2 gap-1.5 text-[12px]" : "grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-4"}>
        {FACTORY_QTY_FIELDS.map((f) => (
          <div key={f.key}><span className="text-t3">{f.label}: </span><span className="text-t">{qty[f.key] ?? f.default}</span></div>
        ))}
      </div>
      {FACTORY_OPTION_GROUPS.filter((g) => g !== "일정/수량").map((g) => (
        <div key={g}>
          <div className="mb-1 text-[11.5px] font-semibold text-t3">{g}</div>
          <div className={dense ? "grid grid-cols-1 gap-x-3 gap-y-1 text-[12px]" : "grid grid-cols-1 gap-x-4 gap-y-1 text-[12.5px] [word-break:keep-all] min-[420px]:grid-cols-2 sm:grid-cols-3"}>
            {fieldsByGroup(g).map((f) => {
              const v = options[f.key];
              const display = f.kind === "pad"
                ? `${(v as { L?: number })?.L ?? f.default.L}/${(v as { R?: number })?.R ?? f.default.R}${f.unit}`
                : String(v ?? f.default);
              return (
                <div key={f.key}><span className="text-t3">{f.label}: </span><span className="text-t">{display}</span></div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
