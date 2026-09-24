"use client";

/**
 * 입학 상담(0023). 목록은 pii.read가 있을 때만 서버가 채워 보낸다(호출부가 이미 걸렀다 —
 * 여기서는 받은 배열을 그대로 그린다). 상태 '등록'은 직접 지정할 수 없고 등록 전환으로만 된다.
 * 상태 탭 → 표(PC 6열)/카드. 새 상담·수정·등록 전환은 모달.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, Pencil } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";
import { SelectField, StatusTab, FilterRow, CardHead, Alert, CONTROL, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import type { AcadConsultation } from "@/lib/domain/academy";
import { CONSULT_STATUSES, type ConsultStatus } from "@/lib/domain/academy-types";
import { createConsultation, updateConsultation, convertConsultation, type ConsultationInput } from "@/lib/domain/academy-actions";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";

const STATUS_KIND: Record<ConsultStatus, BadgeKind> = { 신규: "info", 상담완료: "warning", 등록: "success", 보류: "info", 이탈: "error" };
const EMPTY_FORM: ConsultationInput = { candidateName: "", guardianName: "", guardianPhone: "", source: "", subject: "", consultedAt: "", status: "신규", memo: "" };

export function ConsultationsBoard({ businessId, canWrite, canReadPii, consultations }: {
  businessId: string;
  canWrite: boolean;
  canReadPii: boolean;
  consultations: AcadConsultation[];
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState<"all" | ConsultStatus>("all");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AcadConsultation | null>(null);
  const [form, setForm] = React.useState<ConsultationInput>(EMPTY_FORM);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [convertTarget, setConvertTarget] = React.useState<AcadConsultation | null>(null);
  const [convertForm, setConvertForm] = React.useState({ birthDate: "", school: "", grade: "" });
  const [convertedNotice, setConvertedNotice] = React.useState<{ name: string; studentId: string } | null>(null);

  React.useEffect(() => {
    if (modalOpen) {
      setForm(
        editing
          ? { candidateName: editing.candidateName, guardianName: editing.guardianName ?? "", guardianPhone: editing.guardianPhone ?? "", source: editing.source ?? "", subject: editing.subject ?? "", consultedAt: editing.consultedAt ?? "", status: editing.status === "등록" ? undefined : editing.status, memo: editing.memo ?? "" }
          : EMPTY_FORM
      );
      setError(null);
    }
  }, [modalOpen, editing]);

  const header = (
    <PageHeader
      title="입학 상담"
      description="문의부터 등록 전환까지. 등록 전환하면 학생과 보호자가 만들어지고 상태가 '등록'이 됩니다."
      actions={canWrite && canReadPii ? <Button onClick={() => { setEditing(null); setModalOpen(true); }}><Plus size={15} aria-hidden />새 상담</Button> : undefined}
    >
      {canReadPii && (
        <FilterRow>
          <StatusTab active={statusFilter === "all"} onClick={() => setStatusFilter("all")} count={consultations.length}>전체</StatusTab>
          {CONSULT_STATUSES.map((s) => <StatusTab key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} count={consultations.filter((c) => c.status === s).length}>{s}</StatusTab>)}
        </FilterRow>
      )}
    </PageHeader>
  );

  if (!canReadPii) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="상담 정보를 볼 수 없습니다." description="상담에는 보호자 연락처가 포함되어 개인정보 조회(pii.read) 권한이 필요합니다. 관리자에게 문의하세요." />
        </Card>
      </>
    );
  }

  const filtered = statusFilter === "all" ? consultations : consultations.filter((c) => c.status === statusFilter);
  const converted = consultations.filter((c) => c.status === "등록").length;
  const rate = consultations.length ? Math.round((converted / consultations.length) * 100) : null;

  const submit = async () => {
    if (!form.candidateName?.trim()) { setError("학생 이름을 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = editing ? await updateConsultation(businessId, editing.id, form) : await createConsultation(businessId, form);
      if (!r.ok) { setError(r.message); return; }
      setModalOpen(false);
      setEditing(null);
      router.refresh();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  const doConvert = async () => {
    if (!convertTarget) return;
    setBusy(true); setError(null);
    try {
      const r = await convertConsultation(businessId, convertTarget.id, {
        birthDate: convertForm.birthDate || undefined, school: convertForm.school || undefined, grade: convertForm.grade || undefined,
      });
      if (!r.ok) { setError(r.message); return; }
      setConvertedNotice({ name: convertTarget.candidateName, studentId: r.data.studentId });
      setConvertTarget(null);
      router.refresh();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  const rowView = (c: AcadConsultation) => ({
    name: c.candidateName,
    guardian: c.guardianName ? `${c.guardianName}${c.guardianPhone ? ` · ${c.guardianPhone}` : ""}` : "—",
    source: c.source ?? "—",
    subject: c.subject ?? "—",
    consultedAt: c.consultedAt ? formatInTz(c.consultedAt, DEFAULT_TZ, "yyyy.MM.dd") : "—",
    canConvert: canWrite && c.status !== "등록" && c.status !== "이탈",
  });
  const actionsOf = (c: AcadConsultation, v: ReturnType<typeof rowView>) => (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {canWrite && <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setModalOpen(true); }}><Pencil size={13} aria-hidden />수정</Button>}
      {v.canConvert && <Button variant="secondary" size="sm" onClick={() => { setConvertTarget(c); setConvertForm({ birthDate: "", school: "", grade: "" }); setError(null); }}><UserPlus size={13} aria-hidden />등록 전환</Button>}
    </span>
  );

  return (
    <>
      {header}

      {error && !modalOpen && !convertTarget && <Alert className="mb-4">{error}</Alert>}
      {convertedNotice && (
        <Alert kind="success" className="mb-4">
          {convertedNotice.name} 학생으로 등록 전환했습니다.{" "}
          <Link href={`/w/${businessId}/students/${convertedNotice.studentId}`} className="font-medium underline underline-offset-2">학생 상세 보기 →</Link>
        </Alert>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3 sm:gap-3.5">
        {[
          ["전체 상담", `${consultations.length}건`, "text-t"],
          ["등록 전환", `${converted}건`, "text-t"],
          ["전환율", rate === null ? "—" : `${rate}%`, "text-[var(--accent-ink)]"],
        ].map(([l, v, cls]) => (
          <Card key={l} className="min-w-0 px-4 py-3.5">
            <p className="text-[12px] text-t2">{l}</p>
            <p className={`mt-1.5 truncate text-[22px] font-bold leading-none tabular-nums ${cls}`}>{v}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 sm:p-5">
        <CardHead title={statusFilter === "all" ? "상담 목록" : `${statusFilter} 상담`} description={`${filtered.length}건 · 최근순`} />
        {filtered.length === 0 ? (
          <EmptyState title={statusFilter === "all" ? "상담 기록이 없습니다." : `${statusFilter} 상태인 상담이 없습니다.`} description={statusFilter === "all" && canWrite ? "문의가 들어오면 새 상담으로 기록하세요." : undefined} action={statusFilter === "all" && canWrite ? <Button size="sm" variant="secondary" onClick={() => { setEditing(null); setModalOpen(true); }}>새 상담</Button> : undefined} />
        ) : (
          <TableOrCards
            rows={filtered}
            keyOf={(c) => c.id}
            table={
              <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className={`${TABLE} min-w-[820px]`}>
                  <thead>
                    <tr className={THEAD}>
                      <th className={TH}>학생</th>
                      <th className={TH}>보호자</th>
                      <th className={TH}>유입경로 · 과목</th>
                      <th className={TH}>상담일</th>
                      <th className={TH}>상태</th>
                      <th className={`${TH} text-right`}>동작</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => {
                      const v = rowView(c);
                      return (
                        <tr key={c.id} className={`${TR} h-[52px] hover:bg-sf2`}>
                          <td className={TD}><CellName max={160}>{v.name}</CellName>{c.memo && <span className="block max-w-[200px] truncate text-[11.5px] text-t3" title={c.memo}>{c.memo}</span>}</td>
                          <td className={`${TD} whitespace-nowrap text-t2`}>{v.guardian}</td>
                          <td className={`${TD} text-t2`}>{v.source}<span className="block text-[11.5px] text-t3">{v.subject}</span></td>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{v.consultedAt}</td>
                          <td className={TD}><Badge kind={STATUS_KIND[c.status]}>{c.status}</Badge></td>
                          <td className={`${TD} text-right`}>{actionsOf(c, v)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            }
            card={(c) => {
              const v = rowView(c);
              return (
                <MobileCard
                  title={v.name}
                  sub={v.guardian}
                  badge={<Badge kind={STATUS_KIND[c.status]}>{c.status}</Badge>}
                  fields={[["유입경로", v.source], ["관심 과목", v.subject], ["상담일", v.consultedAt]]}
                  actions={actionsOf(c, v)}
                />
              );
            }}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "상담 수정" : "새 상담"}
        className="sm:max-w-[560px]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>취소</Button>
            <Button onClick={submit} loading={busy}>저장</Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
          {error && <Alert className="mb-4">{error}</Alert>}
          <Input label="학생 이름" required value={form.candidateName ?? ""} onChange={(e) => setForm((f) => ({ ...f, candidateName: e.target.value }))} autoFocus />
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <Input label="보호자 이름" value={form.guardianName ?? ""} onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))} />
            <Input label="보호자 연락처" type="tel" inputMode="tel" value={form.guardianPhone ?? ""} onChange={(e) => setForm((f) => ({ ...f, guardianPhone: e.target.value }))} placeholder="010-0000-0000" />
            <Input label="유입경로" placeholder="블로그, 지인 소개, 전단지…" value={form.source ?? ""} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
            <Input label="관심 과목" value={form.subject ?? ""} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            <Input label="상담 일시" type="datetime-local" value={form.consultedAt ?? ""} onChange={(e) => setForm((f) => ({ ...f, consultedAt: e.target.value }))} />
            {editing && (
              <SelectField label="상태" value={form.status ?? editing.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ConsultStatus }))} hint="'등록'은 목록의 '등록 전환'으로만 바뀝니다.">
                {CONSULT_STATUSES.filter((s) => s !== "등록").map((s) => <option key={s} value={s}>{s}</option>)}
              </SelectField>
            )}
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-t2">
            메모
            <textarea
              value={form.memo ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              rows={3}
              className={`${CONTROL} h-auto min-h-[88px] resize-y py-2 leading-relaxed`}
            />
          </label>
        </form>
      </Modal>

      <Modal
        open={!!convertTarget}
        onClose={() => setConvertTarget(null)}
        title={`${convertTarget?.candidateName ?? ""} 등록 전환`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConvertTarget(null)} disabled={busy}>취소</Button>
            <Button onClick={doConvert} loading={busy}><UserPlus size={14} aria-hidden />등록 전환</Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); doConvert(); }} className="flex flex-col">
          {error && <Alert className="mb-4">{error}</Alert>}
          <p className="mb-4 text-[12.5px] leading-relaxed text-t2">학생을 생성하고 보호자 정보(있으면)를 연결한 뒤 상담 상태를 &apos;등록&apos;으로 바꿉니다. 아래는 선택 입력입니다.</p>
          <Input label="생년월일" type="date" value={convertForm.birthDate} onChange={(e) => setConvertForm((f) => ({ ...f, birthDate: e.target.value }))} autoFocus />
          <div className="grid grid-cols-2 gap-x-3">
            <Input label="학교" value={convertForm.school} onChange={(e) => setConvertForm((f) => ({ ...f, school: e.target.value }))} wrapperClassName="mb-0" />
            <Input label="학년" value={convertForm.grade} onChange={(e) => setConvertForm((f) => ({ ...f, grade: e.target.value }))} placeholder="예: 중2" wrapperClassName="mb-0" />
          </div>
        </form>
      </Modal>
    </>
  );
}
