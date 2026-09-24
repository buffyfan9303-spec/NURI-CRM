"use client";

import { Field } from "@/components/ui/Field";
import type { FactoryFieldDef } from "@/lib/domain/factory-options";

const selectClass =
  "h-11 w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-sm text-t outline-none focus:border-[var(--accent)]";
const numberClass = selectClass;

/** 옵션 41항목 필드 하나를 종류(select/number/pad)에 맞게 렌더링한다. */
export function OptionField({
  def,
  value,
  onChange,
}: {
  def: FactoryFieldDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  if (def.kind === "select") {
    return (
      <Field label={def.label} htmlFor={def.key}>
        <select
          id={def.key}
          className={selectClass}
          value={typeof value === "string" ? value : def.default}
          onChange={(e) => onChange(def.key, e.target.value)}
        >
          {def.choices.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
    );
  }

  if (def.kind === "number") {
    return (
      <Field label={def.label} htmlFor={def.key} hint={def.unit ? `단위: ${def.unit}` : undefined}>
        <input
          id={def.key}
          type="number"
          step={def.step ?? 1}
          className={numberClass}
          value={typeof value === "number" ? value : def.default}
          onChange={(e) => onChange(def.key, e.target.value === "" ? def.default : Number(e.target.value))}
        />
      </Field>
    );
  }

  // pad — 좌/우 숫자 쌍
  const pad = (value as { L?: number; R?: number } | undefined) ?? def.default;
  return (
    <Field label={def.label} htmlFor={`${def.key}-L`} hint={`단위: ${def.unit}`}>
      <div className="flex gap-2">
        <input
          id={`${def.key}-L`}
          type="number"
          aria-label="좌"
          placeholder="좌"
          className={numberClass}
          value={pad.L ?? def.default.L}
          onChange={(e) => onChange(def.key, { L: Number(e.target.value || 0), R: pad.R ?? def.default.R })}
        />
        <input
          type="number"
          aria-label="우"
          placeholder="우"
          className={numberClass}
          value={pad.R ?? def.default.R}
          onChange={(e) => onChange(def.key, { L: pad.L ?? def.default.L, R: Number(e.target.value || 0) })}
        />
      </div>
    </Field>
  );
}
