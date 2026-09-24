/**
 * 우측 슬라이드 디테일 패널.
 * customerDetailStore.openName 을 구독하여 표시.
 * 권한별 마스킹·버튼 노출 처리.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconX,
  IconPencil,
  IconPrinter,
  IconTrash,
  IconQrcode,
} from "@tabler/icons-react";
import { useCustomerDetailStore } from "@/lib/stores/customerDetailStore";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { useToastStore } from "@/lib/stores/toastStore";
import { permissions } from "@/types/auth";
import { displayName, displayPhone } from "@/lib/utils/mask";
import { CustomerAvatar } from "./CustomerAvatar";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { cn } from "@/lib/utils/cn";
import { CustomerEditModal } from "./CustomerEditModal";

export function CustomerDetailPanel() {
  const openName = useCustomerDetailStore((s) => s.openName);
  const close = useCustomerDetailStore((s) => s.close);
  const router = useRouter();
  const customer = useCustomerStore((s) =>
    openName ? s.customers.find((c) => c.name === openName) : undefined
  );
  const removeOrder = useCustomerStore((s) => s.removeOrder);
  const startEditOrder = useCustomerStore((s) => s.startEditOrder);
  const role = useAuthStore((s) => s.user.role);
  const showToast = useToastStore((s) => s.show);
  const [editOpen, setEditOpen] = useState(false);

  /* ESC 키 닫기 */
  useEffect(() => {
    if (!openName) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openName, close]);

  if (!customer) return null;

  const isFactory = role === "factory";
  const canEdit = permissions.canEditCustomer(role);
  const canPrint = permissions.canPrintMTM(role);
  const dispName = displayName(customer.name, role);
  const dispPhone = displayPhone(customer.phone, role);

  const handleEditOrder = (orderNo: string) => {
    startEditOrder(orderNo, customer.name);
    close();
    router.push(`/orders/${encodeURIComponent(orderNo)}/edit`);
  };

  const handleDelOrder = (orderNo: string) => {
    if (!confirm(`주문 ${orderNo} 을(를) 삭제하시겠습니까?\n삭제된 주문은 복구할 수 없습니다.`)) return;
    removeOrder(orderNo);
    showToast("주문 삭제", `${orderNo} 주문이 삭제되었습니다.`, "warn");
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/45 z-[100] flex justify-end"
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <aside
          className="w-full md:w-[430px] max-w-full bg-sf flex flex-col h-full overflow-hidden border-l border-bd shadow-panel"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="px-[22px] py-5 border-b border-bd flex items-center gap-3.5 flex-shrink-0 bg-gradient-to-br from-sf to-sf2">
            <CustomerAvatar name={customer.name} size={48} />
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-bold text-t tracking-tight">{dispName}</div>
              <div className="text-xs text-t2 mt-0.5">
                {dispPhone} · {customer.gender} · {customer.birth}
              </div>
            </div>
            <div className="flex gap-1.5 items-center">
              {canEdit && (
                <IconBtn title="고객 수정" onClick={() => setEditOpen(true)}>
                  <IconPencil size={14} />
                </IconBtn>
              )}
              {canPrint && (
                <IconBtn title="MTM 카드 인쇄" onClick={() => window.print()}>
                  <IconPrinter size={14} />
                </IconBtn>
              )}
              <IconBtn title="닫기" onClick={close} size="md">
                <IconX size={18} />
              </IconBtn>
            </div>
          </div>

          {/* 본문 */}
          <div className="flex-1 overflow-y-auto px-[22px] py-[18px] scrollable">
            <Section title="기본 정보">
              <Grid2>
                <Field label="이름" value={dispName} />
                <Field label="성별" value={customer.gender} />
                <Field label="생년월일" value={customer.birth} />
                <Field label="전화번호" value={dispPhone} />
                {!isFactory && customer.memo && (
                  <Field label="비고" value={customer.memo} full />
                )}
              </Grid2>
            </Section>

            <Section title="MTM 치수 (cm / kg)">
              <Grid3>
                <Field label="키" value={`${customer.height || 0}cm`} />
                <Field label="몸무게" value={`${customer.weight || 0}kg`} />
                <Field label="목둘레" value={String(customer.neck || "-")} />
                <Field label="어깨너비" value={String(customer.shoulder || "-")} />
                <Field label="가슴둘레" value={String(customer.chest || "-")} />
                <Field label="배둘레" value={String(customer.belly || "-")} />
                <Field label="허리둘레" value={String(customer.waist || "-")} />
                <Field label="엉덩이" value={String(customer.hip || "-")} />
                <Field label="허벅지" value={String(customer.thigh || "-")} />
                <Field label="소매길이" value={String(customer.sleeve || "-")} />
                <Field label="상의길이" value={String(customer.jacket || "-")} />
                <Field label="바지허리" value={String(customer.tw || "-")} />
                <Field label="바지길이" value={String(customer.tl || "-")} />
                <Field label="밑위" value={String(customer.rise || "-")} />
              </Grid3>
            </Section>

            <Section title="스타일 사양">
              <Grid2>
                <Field label="원단" value={customer.fabric || "-"} full />
                <Field label="안감" value={customer.lining || "-"} full />
                <Field label="스타일" value={customer.style || "-"} full />
                <Field label="벤트" value={customer.vent || "-"} />
                <Field label="포켓" value={customer.pocket || "-"} />
              </Grid2>
            </Section>

            <Section title="주문 내역" last>
              {customer.orders.length === 0 ? (
                <div className="text-xs text-t3 italic py-2">주문 없음</div>
              ) : (
                customer.orders.map((o) => (
                  <div
                    key={o.no}
                    onClick={() => handleEditOrder(o.no)}
                    className="border border-bd rounded-[9px] px-4 py-3.5 mb-2 bg-sf2 cursor-pointer transition-colors hover:bg-sf3 hover:border-bd2 last:mb-0"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-t3 font-semibold">{o.no}</span>
                      <OrderStatusBadge status={o.st} />
                      <div className="ml-auto flex gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            close();
                            router.push(`/orders/${encodeURIComponent(o.no)}/label`);
                          }}
                          className="w-7 h-7 border border-bd rounded-md text-t2 cursor-pointer flex items-center justify-center transition-colors hover:bg-sf2 hover:text-t"
                          title="QR 라벨 인쇄"
                        >
                          <IconQrcode size={13} />
                        </button>
                        {permissions.canDeleteOrder(role) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelOrder(o.no);
                            }}
                            className="w-7 h-7 border border-bd rounded-md text-t2 cursor-pointer flex items-center justify-center transition-colors hover:bg-eb hover:text-et hover:border-eb"
                            title="주문 삭제"
                          >
                            <IconTrash size={13} />
                          </button>
                        ) : (
                          <IconPencil size={13} className="text-t3 opacity-70 self-center" />
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-t">{o.item}</div>
                    <div className="grid grid-cols-2 gap-1.5 mt-2.5">
                      <Meta label="주문일" value={o.ord} />
                      <Meta label="배송예정" value={o.del} />
                      <Meta label="제작공장" value={o.fac || "-"} />
                      {!isFactory && <Meta label="금액" value={`₩${o.price}`} />}
                    </div>
                  </div>
                ))
              )}
            </Section>
          </div>
        </aside>
      </div>
      {editOpen && (
        <CustomerEditModal
          name={customer.name}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

/* ──────────────────────────── Sub-components ──────────────────────────── */

function IconBtn({
  children,
  onClick,
  title,
  size = "sm",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "border border-bd rounded-md bg-transparent text-t2 cursor-pointer flex items-center justify-center transition-colors hover:bg-sf2 hover:text-t",
        size === "sm" ? "w-7 h-7" : "w-8 h-8"
      )}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  children,
  last,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={cn("mb-[18px] pb-[18px]", !last && "border-b border-bd")}>
      <div className="text-[9px] font-bold text-t3 uppercase tracking-[1px] mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}
function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2">{children}</div>;
}

function Field({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-3 py-2 bg-sf2 rounded-[7px]",
        full && "col-span-full"
      )}
    >
      <div className="text-[10px] text-t3 font-semibold mb-0.5">{label}</div>
      <div className="text-[13px] font-semibold text-t break-words">{value}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[11px] text-t2">
      <span className="text-t3 mr-1 font-bold">{label}</span>
      {value}
    </div>
  );
}
