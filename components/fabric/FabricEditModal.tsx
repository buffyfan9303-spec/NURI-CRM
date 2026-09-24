"use client";

import { useEffect, useState } from "react";
import { IconX, IconCheck } from "@tabler/icons-react";
import {
  FormRow,
  FLabel,
  FInput,
  FSelect,
  FormActions,
  BtnPrimary,
  BtnGhost,
} from "@/components/common/Form";
import { useFabricStore } from "@/lib/stores/fabricStore";
import { useBusinessStore } from "@/lib/stores/businessStore";
import { useAuthStore } from "@/lib/stores/authStore";
import type { Fabric, FabricStatus } from "@/types/fabric";

interface Props {
  fabricId: string | null; // null = 신규
  onClose: () => void;
}

export function FabricEditModal({ fabricId, onClose }: Props) {
  const role = useAuthStore((s) => s.user.role);
  const businessId = useAuthStore((s) => s.user.businessId);
  const fabrics = useFabricStore((s) => s.fabrics);
  const addFab = useFabricStore((s) => s.add);
  const updateFab = useFabricStore((s) => s.update);
  const businesses = useBusinessStore((s) => s.businesses);
  const isAdmin = role === "admin";

  const existing = fabricId ? fabrics.find((f) => f.id === fabricId) : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [bizId, setBizId] = useState(existing?.businessId ?? "");
  const [color, setColor] = useState(existing?.color ?? "");
  const [status, setStatus] = useState<FabricStatus>(existing?.status ?? "여유");
  const [qty, setQty] = useState<number>(existing?.qty ?? 0);
  const [price, setPrice] = useState<number>(existing?.price ?? 0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("원단명을 입력해주세요.");
      return;
    }
    const finalBizId = isAdmin ? bizId : businessId ?? "";
    if (!finalBizId) {
      alert("업체를 선택해주세요.");
      return;
    }
    if (fabricId && existing) {
      updateFab(fabricId, {
        name: trimmed, businessId: finalBizId,
        color: color.trim(), qty, price, status,
      });
    } else {
      addFab({
        name: trimmed, businessId: finalBizId,
        color: color.trim(), qty, price,
        ...(status !== undefined && { status }),
      } as Omit<Fabric, "id">);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[200] flex items-end md:items-center justify-center px-0 md:px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-sf border border-bd rounded-t-2xl md:rounded-2xl py-5 px-5 md:py-6 md:px-7 w-full md:w-[460px] md:max-w-[92vw] max-h-[92vh] md:max-h-[82vh] overflow-y-auto shadow-modal">
        <div className="flex items-center justify-between mb-[18px] pb-3.5 border-b border-bd">
          <span className="text-sm font-bold">{fabricId ? "원단 수정" : "원단 추가"}</span>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 border border-bd rounded-md bg-transparent text-t2 cursor-pointer flex items-center justify-center transition-colors hover:bg-sf2"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="mb-3.5">
          <FLabel required>원단명</FLabel>
          <FInput type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 울 100% 네이비" />
        </div>

        {isAdmin && (
          <div className="mb-3.5">
            <FLabel required>업체</FLabel>
            <FSelect value={bizId} onChange={(e) => setBizId(e.target.value)}>
              <option value="">-- 업체 선택 --</option>
              {businesses
                .filter((b) => b.type === "fabric_store" && b.approved)
                .map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
            </FSelect>
          </div>
        )}

        <FormRow>
          <div><FLabel>색상</FLabel><FInput type="text" value={color} onChange={(e) => setColor(e.target.value)} placeholder="예) 네이비" /></div>
          <div>
            <FLabel>상태</FLabel>
            <FSelect value={status} onChange={(e) => setStatus(e.target.value as FabricStatus)}>
              <option value="여유">여유</option>
              <option value="부족">부족</option>
              <option value="매진">매진</option>
            </FSelect>
          </div>
        </FormRow>

        <FormRow>
          <div><FLabel>재고량 (m)</FLabel><FInput type="number" value={qty} min={0} onChange={(e) => setQty(parseFloat(e.target.value) || 0)} /></div>
          <div><FLabel>단가 (원/m)</FLabel><FInput type="number" value={price} min={0} onChange={(e) => setPrice(parseInt(e.target.value) || 0)} /></div>
        </FormRow>

        <FormActions>
          <BtnGhost onClick={onClose}>취소</BtnGhost>
          <BtnPrimary onClick={handleSave}><IconCheck size={14} />저장</BtnPrimary>
        </FormActions>
      </div>
    </div>
  );
}
