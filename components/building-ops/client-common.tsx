"use client";

/**
 * 건물 관리비 화면 공통 클라이언트 조각: 건물·월 띠, 첫 건물 등록 카드, 서버 액션 실행 훅.
 * 건물·월은 URL(?b= ?p=)이 정본이라 새로고침·공유·뒤로가기가 그대로 된다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/toast";
import { Alert, SelectField } from "@/components/rental/listkit";
import { Input } from "@/components/ui/Input";
import { createBuilding } from "@/lib/domain/building-actions";
import type { ActionResult } from "@/lib/domain/building-actions";

/** 서버 액션 한 번 실행: 진행 중 표시, 서버 오류 문구 그대로 노출, 성공 시 화면 새로고침. */
export function useRunAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = React.useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>, opts: { success?: string; refresh?: boolean } = {}): Promise<ActionResult<T>> => {
      setPending(true);
      setError(null);
      try {
        const r = await fn();
        if (!r.ok) setError(r.message);
        else {
          if (opts.success) toast.success(opts.success);
          if (opts.refresh !== false) router.refresh();
        }
        return r;
      } catch {
        const m = "요청을 보내지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.";
        setError(m);
        return { ok: false, message: m };
      } finally {
        setPending(false);
      }
    },
    [router]
  );
  return { run, pending, error, setError };
}

const KINDS = [
  { v: "commercial", l: "상가·오피스 건물" },
  { v: "condo", l: "집합건물(구분소유)" },
  { v: "apartment", l: "공동주택" },
  { v: "other", l: "기타" },
] as const;

export function CreateBuildingCard({ businessId, canCreate }: { businessId: string; canCreate: boolean }) {
  const { run, pending, error } = useRunAction();
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<(typeof KINDS)[number]["v"]>("commercial");
  const [address, setAddress] = React.useState("");
  const [dueDay, setDueDay] = React.useState("25");
  if (!canCreate) {
    return <Card><EmptyState title="등록된 건물이 없습니다." description="건물은 관리비 항목 설정 권한이 있는 담당자가 먼저 등록합니다. 사업장 관리자에게 요청하세요." /></Card>;
  }
  return (
    <Card className="mx-auto max-w-[560px] p-5">
      <h2 className="mb-1 text-[length:var(--fs-h3,18px)] font-semibold text-t">첫 건물을 등록하세요</h2>
      <p className="mb-4 text-[length:var(--fs-body)] text-t2">건물을 등록하면 호실·검침·비용을 입력할 수 있습니다. 납부 기한일은 나중에 바꿀 수 있습니다.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => createBuilding(businessId, { name: name.trim(), kind, address: address.trim() || undefined, due_day: Number(dueDay) }), { success: "건물을 등록했습니다." });
        }}
      >
        <Input label="건물 이름" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="예: 누리타워" />
        <SelectField label="건물 종류" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
        </SelectField>
        <Input label="주소" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={120} />
        <Input label="납부 기한일(매월 며칠)" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} required className="tabular-nums" />
        {error && <Alert kind="error" className="mb-3">{error}</Alert>}
        <Button type="submit" loading={pending} disabled={!name.trim()}>건물 등록</Button>
      </form>
    </Card>
  );
}

/** 표시 전용 안내 줄(권한 없음·잠금 등). */
export function LockNote({ children }: { children: React.ReactNode }) {
  return <Alert kind="warning">{children}</Alert>;
}
