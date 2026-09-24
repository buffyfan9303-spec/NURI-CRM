/**
 * 고객 정보 수정 모달.
 * 디테일 패널의 ✏️ 버튼에서 트리거. zod 검증 후 customerStore.updateCustomer.
 */
"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconX, IconCheck, IconUserEdit, IconRuler2, IconShirt, IconNotes } from "@tabler/icons-react";
import {
  FormRow,
  FLabel,
  FInput,
  FSelect,
  FTextarea,
  FormActions,
  BtnPrimary,
  BtnGhost,
  FormSectionHd,
} from "@/components/common/Form";
import { MeasurementsFields } from "./MeasurementsFields";
import {
  customerEditSchema,
  type CustomerEditInput,
} from "@/lib/validators/customer";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useToastStore } from "@/lib/stores/toastStore";
import type { Customer, Gender } from "@/types/customer";

interface Props {
  name: string;
  onClose: () => void;
}

export function CustomerEditModal({ name, onClose }: Props) {
  const customer = useCustomerStore((s) =>
    s.customers.find((c) => c.name === name)
  );
  const updateCustomer = useCustomerStore((s) => s.updateCustomer);
  const showToast = useToastStore((s) => s.show);

  const {
    register,
    handleSubmit,
    reset,
  } = useForm<CustomerEditInput>({
    resolver: zodResolver(customerEditSchema),
  });

  useEffect(() => {
    if (customer) {
      reset({
        phone: customer.phone,
        gender: customer.gender,
        memo: customer.memo,
        fabric: customer.fabric,
        lining: customer.lining,
        style: customer.style,
        vent: customer.vent,
        pocket: customer.pocket,
        height: customer.height, weight: customer.weight,
        neck: customer.neck, shoulder: customer.shoulder, chest: customer.chest,
        belly: customer.belly, waist: customer.waist, hip: customer.hip,
        thigh: customer.thigh, sleeve: customer.sleeve, jacket: customer.jacket,
        tw: customer.tw, tl: customer.tl, rise: customer.rise,
      });
    }
  }, [customer, reset]);

  /* ESC 닫기 */
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!customer) return null;

  const onSubmit = (data: CustomerEditInput) => {
    const patch: Partial<Customer> = {
      phone: data.phone || "",
      gender: (data.gender || "미선택") as Gender,
      memo: data.memo || "",
      fabric: data.fabric || "", lining: data.lining || "",
      style: data.style || "", vent: data.vent || "", pocket: data.pocket || "",
      height: data.height, weight: data.weight,
      neck: data.neck, shoulder: data.shoulder, chest: data.chest,
      belly: data.belly, waist: data.waist, hip: data.hip,
      thigh: data.thigh, sleeve: data.sleeve, jacket: data.jacket,
      tw: data.tw, tl: data.tl, rise: data.rise,
    };
    updateCustomer(name, patch);
    showToast("수정 완료", `${name} 고객 정보가 업데이트되었습니다.`, "ok");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[200] flex items-end md:items-center justify-center px-0 md:px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-sf border border-bd rounded-t-2xl md:rounded-2xl py-5 px-5 md:py-6 md:px-7 w-full md:w-[840px] md:max-w-[94vw] max-h-[92vh] md:max-h-[88vh] overflow-y-auto shadow-modal scrollable">
        <div className="flex items-center justify-between mb-[18px] pb-3.5 border-b border-bd">
          <span className="text-sm font-bold text-t flex items-center gap-1.5">
            <IconUserEdit size={16} className="text-acc" />
            고객 정보 수정 — {name}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 border border-bd rounded-md bg-transparent text-t2 cursor-pointer flex items-center justify-center transition-colors hover:bg-sf2"
          >
            <IconX size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FormSectionHd>기본 정보</FormSectionHd>
          <FormRow>
            <div><FLabel>전화번호</FLabel><FInput type="tel" {...register("phone")} /></div>
            <div>
              <FLabel>성별</FLabel>
              <FSelect {...register("gender")}>
                <option value="">선택</option>
                <option value="남성">남성</option>
                <option value="여성">여성</option>
              </FSelect>
            </div>
          </FormRow>

          <MeasurementsFields register={register} />

          <FormSectionHd icon={<IconShirt size={12} />}>스타일 사양</FormSectionHd>
          <FormRow>
            <div><FLabel>원단</FLabel><FInput type="text" {...register("fabric")} /></div>
            <div><FLabel>안감</FLabel><FInput type="text" {...register("lining")} /></div>
          </FormRow>
          <div className="mb-3.5">
            <FLabel>스타일</FLabel>
            <FInput type="text" {...register("style")} />
          </div>
          <FormRow>
            <div><FLabel>벤트</FLabel><FInput type="text" {...register("vent")} /></div>
            <div><FLabel>포켓</FLabel><FInput type="text" {...register("pocket")} /></div>
          </FormRow>

          <FormSectionHd icon={<IconNotes size={12} />}>비고</FormSectionHd>
          <div className="mb-3.5">
            <FTextarea rows={2} {...register("memo")} />
          </div>

          <FormActions>
            <BtnGhost onClick={onClose}>취소</BtnGhost>
            <BtnPrimary type="submit">
              <IconCheck size={14} />
              저장
            </BtnPrimary>
          </FormActions>
        </form>
      </div>
    </div>
  );
}
