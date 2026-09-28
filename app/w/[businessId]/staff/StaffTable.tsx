"use client";

/**
 * 직원·권한 관리. 왼쪽 직원 목록/검색 + 오른쪽 선택한 직원의 역할·권한(§5.8) 구성.
 * 모든 변경은 서버 액션(lib/domain/staff.ts)을 거치고, 그 안에서 requireCap('staff.manage')을
 * 다시 검사한다 — 여기 렌더는 힌트일 뿐이다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Ban, Search, CircleUserRound, X } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/rental/listkit";
import type { Cap } from "@/lib/auth/access";
import { ROLE_LABEL } from "@/components/factory/labels";
import {
  approveMember,
  revokeMember,
  updateMemberRole,
  setMemberCap,
  type MembershipRow,
  type RoleTemplateRow,
} from "@/lib/domain/staff";

const STATUS_LABEL: Record<MembershipRow["status"], { label: string; kind: BadgeKind }> = {
  active: { label: "활성", kind: "success" },
  pending: { label: "승인 대기", kind: "warning" },
  revoked: { label: "해지됨", kind: "error" },
};

/** 원시 cap 문자열을 그대로 나열하지 않기 위한 표시용 그룹핑. */
const CAP_GROUPS: { title: string; caps: Cap[] }[] = [
  { title: "기본 업무", caps: ["view", "write", "inventory.adjust", "export", "delete"] },
  { title: "민감 정보", caps: ["pii.read", "cost.read", "revenue.read"] },
  { title: "금전 처리", caps: ["refund"] },
  { title: "근태", caps: ["attendance.self", "attendance.all"] },
  { title: "관리자 권한", caps: ["staff.manage"] },
];

export function StaffTable({
  businessId,
  currentUserId,
  memberships,
  roleTemplates,
  capLabels,
}: {
  businessId: string;
  currentUserId: string;
  memberships: MembershipRow[];
  roleTemplates: RoleTemplateRow[];
  /** 서버(lib/auth/access.ts CAP_LABEL)에서 그대로 내려받은 표시용 라벨 — 클라이언트 번들에 서버 전용 코드를 끌어오지 않기 위해 props로 전달. */
  capLabels: Record<Cap, string>;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(memberships[0]?.id ?? null);

  const viewerIsOwner = memberships.some((m) => m.userId === currentUserId && m.role === "owner");
  const templateMap = React.useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of roleTemplates) m.set(t.role, t.caps);
    return m;
  }, [roleTemplates]);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? memberships.filter((m) => m.displayName.toLowerCase().includes(needle) || m.userId.toLowerCase().includes(needle) || m.role.toLowerCase().includes(needle) || (ROLE_LABEL[m.role] ?? "").includes(needle))
    : memberships;

  const selected = memberships.find((m) => m.id === selectedId) ?? filtered[0] ?? null;

  const run = async (id: string, fn: () => Promise<{ ok: boolean; message?: string }>, successNotice?: string) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(result.message ?? "처리하지 못했습니다.");
        return;
      }
      if (successNotice) setNotice(successNotice);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (memberships.length === 0) {
    return <p className="px-3 py-8 text-center text-[13px] text-t3">소속된 직원이 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* 왼쪽: 직원 목록/검색 */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-t3" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름/역할 검색…"
              aria-label="직원 검색"
              className="h-[36px] w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf pl-8 pr-3 text-[16px] text-t outline-none focus:border-[var(--accent)] focus:shadow-ring sm:text-[13px] [@media(pointer:coarse)]:h-[44px]"
            />
          </div>
          <div className="flex max-h-[560px] flex-col overflow-y-auto rounded-[var(--r-lg)] border border-[var(--bd)]">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12.5px] text-t3">검색 결과가 없습니다.</p>
            ) : (
              filtered.map((m) => {
                const active = selected?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex min-h-[52px] items-center gap-2.5 border-b border-l-2 border-b-[var(--bd)] px-3 py-2 text-left transition-colors duration-1 last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]",
                      active ? "border-l-[var(--accent-strong)] bg-[var(--accent-soft)]" : "border-l-transparent hover:bg-sf2"
                    )}
                  >
                    <CircleUserRound size={22} className="shrink-0 text-t3" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-t">{m.displayName}</span>
                        {m.userId === currentUserId && <span className="text-[11.5px] text-t3">(본인)</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="text-[11.5px] text-t2">{ROLE_LABEL[m.role] ?? m.role}</span>
                        <Badge kind={STATUS_LABEL[m.status].kind}>{STATUS_LABEL[m.status].label}</Badge>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 오른쪽: 선택한 직원의 역할·범위·권한 */}
        {selected ? (
          <StaffDetail
            key={selected.id}
            member={selected}
            isSelf={selected.userId === currentUserId}
            // owner 부여·강등은 owner 만 가능(서버 0025 tg_owner_role_guard) — 화면도 같은 규칙으로 선택지를 좁힌다.
            roleLocked={!viewerIsOwner && selected.role === "owner"}
            roleTemplates={viewerIsOwner ? roleTemplates : roleTemplates.filter((t) => t.role !== "owner" || selected.role === "owner")}
            templateCaps={templateMap.get(selected.role) ?? []}
            capLabels={capLabels}
            busy={busyId === selected.id}
            onApprove={() => run(selected.id, () => approveMember(businessId, selected.id), "승인했습니다.")}
            onRevoke={() => {
              if (!window.confirm(`${selected.displayName} 님의 접근을 해지할까요? 해지 후에도 이 화면에서 다시 승인해 되돌릴 수 있습니다.`)) return;
              run(selected.id, () => revokeMember(businessId, selected.id), "해지했습니다. 되돌리려면 '재활성'을 누르세요.");
            }}
            onReactivate={() => run(selected.id, () => approveMember(businessId, selected.id), "다시 활성화했습니다.")}
            onRoleChange={(role, keepOverrides) =>
              run(
                selected.id,
                () => updateMemberRole(businessId, selected.id, role, { resetOverrides: !keepOverrides }),
                keepOverrides
                  ? `역할을 '${ROLE_LABEL[role] ?? role}'로 변경했습니다(개별 권한 유지).`
                  : `역할을 '${ROLE_LABEL[role] ?? role}'로 변경했습니다(개별 권한 초기화).`
              )
            }
            onToggleCap={(cap, next) => run(selected.id, () => setMemberCap(businessId, selected.id, cap, next), `'${capLabels[cap]}' 권한을 ${next ? "켰습니다" : "껐습니다"}.`)}
          />
        ) : (
          <p className="px-3 py-8 text-center text-[13px] text-t3">검색 결과가 없습니다.</p>
        )}
      </div>
    </div>
  );
}

function StaffDetail({
  member,
  isSelf,
  roleLocked,
  roleTemplates,
  templateCaps,
  capLabels,
  busy,
  onApprove,
  onRevoke,
  onReactivate,
  onRoleChange,
  onToggleCap,
}: {
  member: MembershipRow;
  isSelf: boolean;
  roleLocked: boolean;
  roleTemplates: RoleTemplateRow[];
  templateCaps: string[];
  capLabels: Record<Cap, string>;
  busy: boolean;
  onApprove: () => void;
  onRevoke: () => void;
  onReactivate: () => void;
  onRoleChange: (role: string, keepOverrides: boolean) => void;
  onToggleCap: (cap: Cap, next: boolean) => void;
}) {
  const [pendingRole, setPendingRole] = React.useState<string | null>(null);
  const [keepOverrides, setKeepOverrides] = React.useState(false);
  const hasOverrides = member.permGrant.length > 0 || member.permRevoke.length > 0;

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf p-4 shadow-card sm:p-5">
      {/* 요약 헤더: 이름·상태 → 동작. 아래는 섹션(역할 / 개별 권한). */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--bd)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--fs-card)] font-semibold tracking-[var(--tr-snug)] text-t">{member.displayName}</span>
            {isSelf && <span className="text-[11.5px] text-t3">(본인)</span>}
            <Badge kind={STATUS_LABEL[member.status].kind}>{STATUS_LABEL[member.status].label}</Badge>
          </div>
          <p className="mt-0.5 text-[11.5px] text-t3">소속 사업장 직원 · 역할과 개별 권한을 관리합니다.</p>
        </div>
        <div className="flex gap-1.5">
          {member.status === "pending" && (
            <Button size="sm" loading={busy} onClick={onApprove}>
              <Check size={14} aria-hidden />
              승인
            </Button>
          )}
          {member.status === "revoked" && (
            <Button size="sm" variant="secondary" loading={busy} onClick={onReactivate}>
              <Check size={14} aria-hidden />
              재활성
            </Button>
          )}
          {member.status !== "revoked" && (
            <Button size="sm" variant="secondary" loading={busy} onClick={onRevoke} className="text-et">
              <Ban size={14} aria-hidden />
              해지
            </Button>
          )}
        </div>
      </div>

      {/* C6: 라벨은 선택칸 위 줄, 선택칸은 터치 44px, 역할은 한글(셸 roleLabel 과 같은 표). */}
      <label className="mb-1.5 block text-[13px] font-medium text-t2">
        <span className="block">역할</span>
        <select
          value={member.role}
          disabled={busy || roleLocked}
          onChange={(e) => {
            if (hasOverrides) {
              setPendingRole(e.target.value);
              setKeepOverrides(false);
            } else {
              onRoleChange(e.target.value, false);
            }
          }}
          className="mt-1.5 h-10 w-full max-w-[260px] rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-2.5 text-[16px] text-t outline-none focus:border-[var(--accent)] focus:shadow-ring sm:text-[13px] [@media(pointer:coarse)]:h-[44px]"
        >
          {roleTemplates.map((t) => (
            <option key={t.role} value={t.role}>
              {ROLE_LABEL[t.role] ?? t.role}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11.5px] text-t3">역할을 바꾸면 아래 기본 권한 표시가 새 역할 기준으로 즉시 바뀝니다.</span>
      </label>

      {pendingRole && (
        <div className="mb-4 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 p-3">
          <p className="text-[12.5px] text-t2">
            이 직원에게 개별로 추가·제한한 권한이 있습니다. &lsquo;{ROLE_LABEL[pendingRole] ?? pendingRole}&rsquo;로 변경할 때 이 개별 권한을 어떻게 할까요?
          </p>
          <label className="mt-2 flex items-center gap-1.5 text-[12px] text-t2">
            <input type="checkbox" checked={keepOverrides} onChange={(e) => setKeepOverrides(e.target.checked)} className="h-4 w-4" />
            개별 권한 유지(끄면 새 역할 기본값으로 초기화)
          </label>
          <div className="mt-2 flex gap-1.5">
            <Button
              size="sm"
              loading={busy}
              onClick={() => {
                onRoleChange(pendingRole, keepOverrides);
                setPendingRole(null);
              }}
            >
              확인
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setPendingRole(null)}>
              취소
            </Button>
          </div>
        </div>
      )}

      <h3 className="mb-2 text-[13px] font-semibold text-t">개별 권한</h3>
      <p className="mb-3 text-[11.5px] text-t3">역할 기본값에서 이 직원만 켜거나(추가 허용) 끈(추가 제한) 항목을 표시합니다. 즉시 저장되며 되돌릴 수 있습니다.</p>
      <div className="flex flex-col gap-3">
        {CAP_GROUPS.map((group) => (
          <div key={group.title}>
            <h4 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-t3">{group.title}</h4>
            <div className="flex flex-wrap gap-1.5">
              {group.caps.map((cap) => {
                const fromRole = templateCaps.includes(cap);
                const granted = member.permGrant.includes(cap);
                const revoked = member.permRevoke.includes(cap);
                const effective = (fromRole || granted) && !revoked;
                return (
                  <button
                    key={cap}
                    type="button"
                    disabled={busy}
                    onClick={() => onToggleCap(cap, !effective)}
                    title={fromRole ? "역할 기본 권한" : "개별 추가 권한"}
                    aria-pressed={effective}
                    className={cn(
                      "flex min-h-[34px] items-center gap-1.5 rounded-[var(--r-md)] border px-2.5 py-1 text-[12px] font-medium transition-colors duration-1 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] [@media(pointer:coarse)]:min-h-[44px]",
                      effective
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                        : "border-[var(--bd)] bg-sf2 text-t3 hover:border-[var(--bd-strong)] hover:text-t2"
                    )}
                  >
                    {effective ? <Check size={13} aria-hidden /> : <X size={13} aria-hidden />}
                    {capLabels[cap]}
                    {/* F20: opacity-70 + 10px 은 대비 2.85:1 — 불투명 글자색을 그대로 물려받아 4.5:1 이상. */}
                    {fromRole && <span className="text-[11.5px]">(역할기본)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
