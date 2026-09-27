"use client";

import * as React from "react";
import { Field } from "@/components/ui/Field";
import type { FactoryFieldDef } from "@/lib/domain/factory-options";

// html{font-size:14px} 라 h-11(2.75rem)은 38.5px — 터치 44px 을 지키려면 px 로 적는다.
const selectClass =
  "h-[44px] w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-sm text-t outline-none focus:border-[var(--accent)]";
const numberClass = selectClass;

/**
 * 숫자칸 — 입력 중에는 비워 둘 수 있다(F29: 예전엔 지우는 즉시 기본값 8.5 로 되돌아가 값을 고칠 수 없었다).
 * 부모 state 에는 유한한 숫자만 올리고, 비운 채 포커스를 떠나면 그때 fallback 을 확정한다.
 * 되돌리기 등으로 밖에서 값이 바뀌면(포커스 없을 때) 표시 문자열을 다시 맞춘다.
 */
function NumberInput({
  id, value, fallback, step, ariaLabel, placeholder, onCommit,
}: {
  id?: string; value: number; fallback: number; step?: number; ariaLabel?: string; placeholder?: string;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = React.useState(String(value));
  const focused = React.useRef(false);
  React.useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  return (
    <input
      id={id}
      type="number"
      step={step ?? 1}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={numberClass}
      value={text}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n)) onCommit(n);
      }}
      onBlur={() => {
        focused.current = false;
        if (text.trim() === "" || !Number.isFinite(Number(text))) { setText(String(fallback)); onCommit(fallback); }
      }}
    />
  );
}

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
        <NumberInput
          id={def.key}
          step={def.step}
          value={typeof value === "number" ? value : def.default}
          fallback={def.default}
          onCommit={(n) => onChange(def.key, n)}
        />
      </Field>
    );
  }

  // pad — 좌/우 숫자 쌍
  const pad = (value as { L?: number; R?: number } | undefined) ?? def.default;
  const L = pad.L ?? def.default.L, R = pad.R ?? def.default.R;
  return (
    <Field label={def.label} htmlFor={`${def.key}-L`} hint={`단위: ${def.unit}`}>
      <div className="flex gap-2">
        <NumberInput id={`${def.key}-L`} ariaLabel="좌" placeholder="좌" value={L} fallback={def.default.L} onCommit={(n) => onChange(def.key, { L: n, R })} />
        <NumberInput ariaLabel="우" placeholder="우" value={R} fallback={def.default.R} onCommit={(n) => onChange(def.key, { L, R: n })} />
      </div>
    </Field>
  );
}
