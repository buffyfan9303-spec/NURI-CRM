"use client";

import { useState, useEffect } from "react";
import { IconCurrencyWon, IconDeviceFloppy } from "@tabler/icons-react";
import {
  FormCard,
  FormCardTitle,
  FLabel,
  FInput,
  FormActions,
  BtnPrimary,
} from "@/components/common/Form";
import { useConfigStore } from "@/lib/stores/configStore";
import { useToastStore } from "@/lib/stores/toastStore";
import type { SysConfig } from "@/lib/constants/basePrice";

const FIELDS: { key: keyof SysConfig; label: string }[] = [
  { key: "base_single_suit", label: "싱글 수트 (원)" },
  { key: "base_double_suit", label: "더블 수트 (원)" },
  { key: "base_three_piece", label: "쓰리피스 (원)" },
  { key: "base_jacket",      label: "재킷 (원)" },
  { key: "base_pants",       label: "팬츠 (원)" },
  { key: "base_coat",        label: "코트 (원)" },
  { key: "base_vest",        label: "조끼 (원)" },
];

export function BasePriceConfig() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const showToast = useToastStore((s) => s.show);

  const [draft, setDraft] = useState<SysConfig>(config);

  useEffect(() => setDraft(config), [config]);

  const handleSave = () => {
    update(draft);
    showToast(
      "설정 저장 완료",
      "기준 가격이 업데이트되었습니다. 신규 주문 가격 산출에 즉시 반영됩니다.",
      "ok"
    );
  };

  return (
    <FormCard>
      <FormCardTitle icon={<IconCurrencyWon size={17} className="text-gold" />}>
        기준 가격 설정{" "}
        <span className="text-[10px] text-t3 font-normal ml-1">— BASE_PRICE 조정</span>
      </FormCardTitle>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 mb-3.5">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <FLabel>{f.label}</FLabel>
            <FInput
              type="number"
              min={0}
              step={10000}
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: parseInt(e.target.value) || 0 })}
            />
          </div>
        ))}
      </div>

      <FormActions>
        <BtnPrimary onClick={handleSave}>
          <IconDeviceFloppy size={14} />
          설정 저장
        </BtnPrimary>
      </FormActions>
    </FormCard>
  );
}
