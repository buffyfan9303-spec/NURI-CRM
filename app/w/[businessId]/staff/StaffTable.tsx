"use client";

/**
 * 직원·권한 관리. 왼쪽 직원 목록/검색 + 오른쪽 선택한 직원의 역할·권한(§5.8) 구성.
 * 모든 변경은 서버 액션(lib/domain/staff.ts)을 거치고, 그 안에서 requireCap('staff.manage')을
 * 다시 검사한다 — 여기 렌더는 힌트일 뿐이다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Ban, CircleAlert, Search, CircleUserRound, X } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import type { Cap } from "@/lib/auth/access";
import {
  approveMember,
  revokeMember,
  updateMemberRole,
  setMemberCap,
  type MembershipRow,
  type RoleTemplateRow,
} from "@/lib/domain/staff";

const STATUS_LABEL: Record<MembershipRow["status"], { label: string; cls: string }> = {
  active: { label: "활성", cls: "bg-okb text-okt" },
  pending: { label: "승인 대기", cls: "bg-wb text-wt" },
  revoked: { label: "해지됨", cls: "bg-eb text-et" },
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
    ? memberships.filter((m) => m.displayName.toLowerCase().includes(needle) || m.userId.toLowerCase().includes(needle) || m.role.toLowerCase().includes(needle))
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
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-eb px-3.5 py-2.5 text-[12.5px] text-et">
          <CircleAlert size={15} className="mt-[1px] shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-okb px-3.5 py-2.5 text-[12.5px] text-okt">
          <Check size={15} className="mt-[1px] shrink-0" aria-hidden />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* 왼쪽: 직원 목록/검색 */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-t3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="사용자 ID/역할 검색…"
              className="h-9 w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf pl-8 pr-3 text-[13px] text-t outline-none focus:border-[var(--accent)]"
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
                    className={cn(
                      "flex min-h-[52px] items-center gap-2.5 border-b border-[var(--bd)] px-3 py-2 text-left last:border-b-0",
                      active ? "bg-sel" : "hover:bg-sf2"
                    )}
                  >
                    <CircleUserRound size={22} className="shrink-0 text-t3" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-t">{m.displayName}</span>
                        {m.userId === currentUserId && <span className="text-[10.5px] text-t3">(본인)</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="text-[11.5px] text-t2">{m.role}</span>
                        <span className={cn("rounded-[6px] px-1.5 py-px text-[10px] font-bold", STATUS_LABEL[m.status].cls)}>{STATUS_LABEL[m.status].label}</span>
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
                  ? `역할을 '${role}'로 변경했습니다(개별 권한 유지).`
                  : `역할을 '${role}'로 변경했습니다(개별 권한 초기화).`
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
    <div className="rounded-[var(--r-lg)] border border-[var(--bd)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--bd)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-t">{member.displayName}</span>
            {isSelf && <span className="text-[11px] text-t3">(본인)</span>}
            <span className={cn("rounded-[6px] px-2 py-0.5 text-[11px] font-bold", STATUS_LABEL[member.status].cls)}>{STATUS_LABEL[member.status].label}</span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-t3">소속 사업장 직원 · 역할과 개별 권한을 관리합니다.</p>
        </div>
        <div className="flex gap-1.5">
          {member.status === "pending" && (
            <button type="button" disabled={busy} onClick={onApprove} className="flex min-h-[36px] items-center gap-1 rounded-[var(--r-sm)] border border-[var(--bd2)] px-3 text-[12.5px] text-okt hover:bg-sf2 disabled:opacity-50">
              <Check size={14} aria-hidden />
              승인
            </button>
          )}
          {member.status === "revoked" && (
            <button type="button" disabled={busy} onClick={onReactivate} className="flex min-h-[36px] items-center gap-1 rounded-[var(--r-sm)] border border-[var(--bd2)] px-3 text-[12.5px] text-okt hover:bg-sf2 disabled:opacity-50">
              <Check size={14} aria-hidden />
              재활성
            </button>
          )}
          {member.status !== "revoked" && (
            <button type="button" disabled={busy} onClick={onRevoke} className="flex min-h-[36px] items-center gap-1 rounded-[var(--r-sm)] border border-[var(--bd2)] px-3 text-[12.5px] text-et hover:bg-sf2 disabled:opacity-50">
              <Ban size={14} aria-hidden />
              해지
            </button>
          )}
        </div>
      </div>

      <label className="mb-1.5 block text-[13px] font-medium text-t2">
        역할
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
          className="mt-1.5 h-10 w-full max-w-[260px] rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-2.5 text-[13px] text-t outline-none focus:border-[var(--accent)]"
        >
          {roleTemplates.map((t) => (
            <option key={t.role} value={t.role}>
              {t.role}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11.5px] text-t3">역할을 바꾸면 아래 기본 권한 표시가 새 역할 기준으로 즉시 바뀝니다.</span>
      </label>

      {pendingRole && (
        <div className="mb-4 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 p-3">
          <p className="text-[12.5px] text-t2">
            이 직원에게 개별로 추가·제한한 권한이 있습니다. &lsquo;{pendingRole}&rsquo;로 변경할 때 이 개별 권한을 어떻게 할까요?
          </p>
          <label className="mt-2 flex items-center gap-1.5 text-[12px] text-t2">
            <input type="checkbox" checked={keepOverrides} onChange={(e) => setKeepOverrides(e.target.checked)} className="h-4 w-4" />
            개별 권한 유지(끄면 새 역할 기본값으로 초기화)
          </label>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onRoleChange(pendingRole, keepOverrides);
                setPendingRole(null);
              }}
              className="min-h-[32px] rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--accent-soft)] px-3 text-[12px] font-medium text-[var(--accent-ink)] disabled:opacity-50"
            >
              확인
            </button>
            <button type="button" disabled={busy} onClick={() => setPendingRole(null)} className="min-h-[32px] rounded-[var(--r-sm)] border border-[var(--bd2)] px-3 text-[12px] text-t2 disabled:opacity-50">
              취소
            </button>
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
                    className={cn(
                      "flex min-h-[34px] items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50",
                      effective
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                        : "border-[var(--bd)] bg-sf2 text-t3"
                    )}
                  >
                    {effective ? <Check size={13} aria-hidden /> : <X size={13} aria-hidden />}
                    {capLabels[cap]}
                    {fromRole && <span className="text-[10px] opacity-70">(역할기본)</span>}
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
