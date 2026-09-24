/**
 * 주문 등록·수정 통합 폼.
 *
 *   - 신규: customerName 빈 값, 사용자가 고객 선택
 *   - 수정: editingOrderNo 전달, 고객 잠금, 기존 값 prefill
 *
 * 가격은 품목명 + 원단 조합으로 실시간 자동 산출.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconClipboardList,
  IconCheck,
} from "@tabler/icons-react";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useFabricStore } from "@/lib/stores/fabricStore";
import { useConfigStore } from "@/lib/stores/configStore";
import { useToastStore } from "@/lib/stores/toastStore";
import { useOrderSubmit } from "@/hooks/useOrderSubmit";
import {
  FormCard,
  FormCardTitle,
  FormRow,
  FLabel,
  FInput,
  FSelect,
  FormActions,
  BtnPrimary,
  BtnGhost,
} from "@/components/common/Form";
import { FabricRowEditor } from "./FabricRowEditor";
import { calculateOrderPrice } from "@/lib/utils/price";
import { ORDER_STATUSES, type Order, type OrderFabric, type OrderStatus } from "@/types/order";

interface Props {
  /** 신규일 때 null, 수정일 때 (orderNo, customerName) */
  editing: { orderNo: string; customerName: string } | null;
}

export function OrderForm({ editing }: Props) {
  const router = useRouter();
  const customers = useCustomerStore((s) => s.customers);
  const findOrder = useCustomerStore((s) => s.findOrder);
  const fabrics = useFabricStore((s) => s.fabrics);
  const getBasePriceTable = useConfigStore((s) => s.getBasePriceTable);
  const showToast = useToastStore((s) => s.show);
  const { submit } = useOrderSubmit();

  /* 폼 상태 */
  const [customerName, setCustomerName] = useState(editing?.customerName ?? "");
  const [item, setItem] = useState("");
  const [ordDate, setOrdDate] = useState("");
  const [delDate, setDelDate] = useState("");
  const [fac, setFac] = useState("");
  const [st, setSt] = useState<OrderStatus>("주문접수");
  const [rows, setRows] = useState<OrderFabric[]>([]);
  const [orderNo, setOrderNo] = useState<string>("");

  /* 편집 모드: 기존 주문 데이터 prefill */
  useEffect(() => {
    if (!editing) return;
    const found = findOrder(editing.orderNo);
    if (!found) return;
    const o = found.order;
    setCustomerName(editing.customerName);
    setItem(o.item);
    setOrdDate(o.ord.replace(/\./g, "-"));
    setDelDate(o.del.replace(/\./g, "-"));
    setFac(o.fac || "");
    setSt(o.st);
    setRows(o.fabrics ?? []);
    setOrderNo(o.no);
  }, [editing, findOrder]);

  /* 가격 자동 산출 */
  const priceTable = useMemo(() => getBasePriceTable(), [getBasePriceTable]);
  const { display: priceDisplay } = useMemo(
    () => calculateOrderPrice({ itemText: item, rows, fabrics, basePriceTable: priceTable }),
    [item, rows, fabrics, priceTable]
  );

  const handleSubmit = () => {
    if (!customerName) {
      showToast("입력 오류", "고객을 선택해주세요.", "warn");
      return;
    }
    if (!item.trim()) {
      showToast("입력 오류", "품목명을 입력해주세요.", "warn");
      return;
    }
    const draft: Omit<Order, "no"> = {
      item: item.trim(),
      ord: ordDate.replace(/-/g, "."),
      del: delDate.replace(/-/g, "."),
      fac: fac.trim(),
      st,
      price: priceDisplay || "",
      fabrics: rows.filter((r) => r.fabricBizId),
    };
    const result = submit({
      customerName,
      draft,
      editingOrderNo: editing?.orderNo ?? null,
    });
    showToast(
      editing ? "주문 수정 완료" : "주문 등록 완료",
      `${result.no} — ${customerName}`,
      "ok"
    );
    router.push("/customers");
  };

  const handleCancel = () => {
    router.push("/customers");
  };

  return (
    <FormCard>
      <FormCardTitle icon={<IconClipboardList size={17} className="text-acc" />}>
        {editing ? "주문 수정" : "신규 주문 등록"}
      </FormCardTitle>

      <FormRow>
        <div>
          <FLabel required>고객명</FLabel>
          <FSelect
            value={customerName}
            disabled={!!editing}
            onChange={(e) => setCustomerName(e.target.value)}
          >
            <option value="">-- 고객 선택 --</option>
            {customers.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </FSelect>
        </div>
        <div>
          <FLabel>주문번호</FLabel>
          <FInput
            type="text"
            value={orderNo}
            readOnly
            placeholder="자동생성"
            className="opacity-65"
          />
        </div>
      </FormRow>

      <div className="mb-3.5">
        <FLabel required>품목명</FLabel>
        <FInput
          type="text"
          value={item}
          onChange={(e) => setItem(e.target.value)}
          placeholder="예) 싱글 수트 (상하의)"
        />
      </div>

      <FormRow>
        <div>
          <FLabel>주문일</FLabel>
          <FInput type="date" value={ordDate} onChange={(e) => setOrdDate(e.target.value)} />
        </div>
        <div>
          <FLabel>배송예정일</FLabel>
          <FInput type="date" value={delDate} onChange={(e) => setDelDate(e.target.value)} />
        </div>
      </FormRow>

      <FormRow>
        <div>
          <FLabel>제작공장</FLabel>
          <FInput
            type="text"
            value={fac}
            onChange={(e) => setFac(e.target.value)}
            placeholder="예) 성동봉제"
          />
        </div>
        <div>
          <FLabel>상태</FLabel>
          <FSelect value={st} onChange={(e) => setSt(e.target.value as OrderStatus)}>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FSelect>
        </div>
      </FormRow>

      <FormRow>
        <div>
          <FLabel>
            금액 <span className="text-[9px] text-it font-normal">자동산출</span>
          </FLabel>
          <FInput
            type="text"
            value={priceDisplay}
            readOnly
            placeholder="품목·원단 선택 시 자동 계산"
            className="bg-sf2 text-it font-bold cursor-default placeholder:text-t3"
          />
        </div>
      </FormRow>

      <div className="mb-3.5">
        <FLabel>
          원단 선택{" "}
          <span className="text-[9px] text-t3 font-normal">
            (선택사항 · 여러 업체·원단 추가 가능)
          </span>
        </FLabel>
        <FabricRowEditor rows={rows} onChange={setRows} />
      </div>

      <FormActions>
        <BtnGhost onClick={handleCancel}>취소</BtnGhost>
        <BtnPrimary onClick={handleSubmit}>
          <IconCheck size={14} />
          {editing ? "저장" : "등록"}
        </BtnPrimary>
      </FormActions>
    </FormCard>
  );
}
