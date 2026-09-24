/**
 * 고객 등록 폼.
 * react-hook-form + zod 검증, 성공 시 customerStore.addCustomer + 토스트 + /customers 이동.
 */
"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  IconUserPlus,
  IconRuler2,
  IconCheck,
} from "@tabler/icons-react";
import {
  FormCard,
  FormCardTitle,
  FormRow,
  FLabel,
  FInput,
  FSelect,
  FTextarea,
  MeasBox,
  FormActions,
  BtnPrimary,
  BtnGhost,
} from "@/components/common/Form";
import { MeasurementsFields } from "./MeasurementsFields";
import {
  customerRegisterSchema,
  type CustomerRegisterInput,
} from "@/lib/validators/customer";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useToastStore } from "@/lib/stores/toastStore";
import type { Customer, Gender } from "@/types/customer";

export function CustomerRegisterForm() {
  const router = useRouter();
  const addCustomer = useCustomerStore((s) => s.addCustomer);
  const getByName = useCustomerStore((s) => s.getByName);
  const showToast = useToastStore((s) => s.show);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerRegisterInput>({
    resolver: zodResolver(customerRegisterSchema),
    defaultValues: {
      name: "",
      phone: "",
      birth: "1993-01-01",
      gender: "",
      memo: "",
      retailer: "",
      height: 0, weight: 0, neck: 0, shoulder: 0, chest: 0,
      belly: 0, waist: 0, hip: 0, thigh: 0, sleeve: 0,
      jacket: 0, tw: 0, tl: 0, rise: 0,
    },
  });

  const onSubmit = (data: CustomerRegisterInput) => {
    if (getByName(data.name)) {
      showToast("등록 오류", "동일한 이름의 고객이 이미 존재합니다.", "warn");
      return;
    }
    const today = new Date();
    const reg = `${String(today.getFullYear()).slice(2)}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
    const customer: Customer = {
      name: data.name,
      birth: data.birth.replace(/-/g, "."),
      phone: data.phone,
      gender: (data.gender || "미선택") as Gender,
      height: data.height, weight: data.weight,
      neck: data.neck, shoulder: data.shoulder, chest: data.chest,
      belly: data.belly, waist: data.waist, hip: data.hip,
      thigh: data.thigh, sleeve: data.sleeve, jacket: data.jacket,
      tw: data.tw, tl: data.tl, rise: data.rise,
      fabric: "", lining: "", style: "", vent: "", pocket: "",
      memo: data.memo || "",
      retailer: data.retailer || "",
      reg,
      orders: [],
    };
    addCustomer(customer);
    showToast("등록 완료", `${customer.name} 고객이 등록되었습니다.`, "ok");
    router.push("/customers");
  };

  /* 모든 zod refine 에러 토스트 (가슴/허리 비율, 바지 길이) */
  const onInvalid = () => {
    const firstError =
      errors.name?.message ||
      errors.phone?.message ||
      errors.chest?.message ||
      errors.tl?.message;
    if (firstError) showToast("입력 오류", firstError, "warn");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
      <FormCard>
        <FormCardTitle icon={<IconUserPlus size={17} className="text-acc" />}>
          신규 고객 등록
        </FormCardTitle>

        <FormRow>
          <div>
            <FLabel required>이름</FLabel>
            <FInput type="text" placeholder="홍길동" {...register("name")} />
          </div>
          <div>
            <FLabel required>생년월일</FLabel>
            <FInput type="date" {...register("birth")} />
          </div>
        </FormRow>

        <FormRow>
          <div>
            <FLabel required>전화번호</FLabel>
            <FInput type="tel" placeholder="010-0000-0000" {...register("phone")} />
          </div>
          <div>
            <FLabel>성별</FLabel>
            <FSelect {...register("gender")}>
              <option value="">선택</option>
              <option value="남성">남성</option>
              <option value="여성">여성</option>
            </FSelect>
          </div>
        </FormRow>

        <div className="mb-3.5">
          <FLabel>소매점</FLabel>
          <FInput type="text" placeholder="소매점명 입력 (선택)" {...register("retailer")} />
        </div>

        <MeasBox>
          <div className="text-[11px] font-bold text-t2 mb-3.5 flex items-center gap-1.5 uppercase tracking-[.4px]">
            <IconRuler2 size={14} />
            MTM 신체 치수 — 전체 선택 입력 (공란 가능)
          </div>
          <MeasurementsFields register={register} />
        </MeasBox>

        <div className="mb-3.5">
          <FLabel>비고</FLabel>
          <FTextarea placeholder="스타일 선호, 특이사항 등 자유 기입" {...register("memo")} />
        </div>

        <FormActions>
          <BtnGhost onClick={() => router.push("/customers")}>취소</BtnGhost>
          <BtnPrimary type="submit">
            <IconCheck size={14} />
            등록 완료
          </BtnPrimary>
        </FormActions>
      </FormCard>
    </form>
  );
}
