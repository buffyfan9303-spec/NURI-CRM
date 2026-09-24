/**
 * MTM 치수 14항목 입력 — react-hook-form register 받음.
 * 등록 폼 / 수정 모달이 공통으로 사용.
 */
"use client";

import {
  IconScale,
  IconShirt,
  IconRectangleVertical,
} from "@tabler/icons-react";
import type { UseFormRegister, FieldValues, Path } from "react-hook-form";
import {
  FInput,
  FLabel,
  FormRow,
  FormSectionHd,
} from "@/components/common/Form";

interface Props<T extends FieldValues> {
  register: UseFormRegister<T>;
}

export function MeasurementsFields<T extends FieldValues>({ register }: Props<T>) {
  /** 키를 T 의 Path 로 강제 (모든 폼이 measurementsSchema 를 merge 한다는 전제) */
  const r = (k: string) => register(k as Path<T>, { valueAsNumber: false });

  return (
    <>
      <FormSectionHd icon={<IconScale size={12} />}>기본 체형</FormSectionHd>
      <FormRow cols={2}>
        <div>
          <FLabel>키 (cm)</FLabel>
          <FInput type="number" placeholder="175" {...r("height")} />
        </div>
        <div>
          <FLabel>몸무게 (kg)</FLabel>
          <FInput type="number" placeholder="70" {...r("weight")} />
        </div>
      </FormRow>

      <FormSectionHd icon={<IconShirt size={12} />}>상의 치수</FormSectionHd>
      <FormRow cols={3}>
        <div><FLabel>목둘레</FLabel><FInput type="number" placeholder="38" {...r("neck")} /></div>
        <div><FLabel>어깨너비</FLabel><FInput type="number" placeholder="44" {...r("shoulder")} /></div>
        <div><FLabel>가슴둘레</FLabel><FInput type="number" placeholder="96" {...r("chest")} /></div>
      </FormRow>
      <FormRow cols={3}>
        <div><FLabel>배둘레</FLabel><FInput type="number" placeholder="84" {...r("belly")} /></div>
        <div><FLabel>허리둘레</FLabel><FInput type="number" placeholder="80" {...r("waist")} /></div>
        <div><FLabel>엉덩이</FLabel><FInput type="number" placeholder="94" {...r("hip")} /></div>
      </FormRow>
      <FormRow cols={3}>
        <div><FLabel>허벅지</FLabel><FInput type="number" placeholder="56" {...r("thigh")} /></div>
        <div><FLabel>소매길이</FLabel><FInput type="number" placeholder="62" {...r("sleeve")} /></div>
        <div><FLabel>상의길이</FLabel><FInput type="number" placeholder="74" {...r("jacket")} /></div>
      </FormRow>

      <FormSectionHd icon={<IconRectangleVertical size={12} />}>하의 치수</FormSectionHd>
      <FormRow cols={3}>
        <div><FLabel>바지허리</FLabel><FInput type="number" placeholder="82" {...r("tw")} /></div>
        <div><FLabel>바지길이</FLabel><FInput type="number" placeholder="108" {...r("tl")} /></div>
        <div><FLabel>밑위</FLabel><FInput type="number" placeholder="28" {...r("rise")} /></div>
      </FormRow>
    </>
  );
}
