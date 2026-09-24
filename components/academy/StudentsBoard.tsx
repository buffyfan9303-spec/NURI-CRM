"use client";

/**
 * 학생·보호자. pii.read가 없으면 연락처 입력 폼 자체를 렌더링하지 않는다
 * (요청조차 하지 않는다 — 명세 §3-7 "권한이 없으면 화면에서 필드 자체를 숨긴다").
 * 4열 표(이름 / 학교·학년 / 보호자 / 동작) — 등록·보호자 추가는 모달.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, UserPlus } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { CellName } from "@/components/ui/ResponsiveTable";
import { SearchBox, StatusTab, FilterRow, CardHead, Alert, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import type { AcadStudent, AcadGuardian } from "@/lib/domain/academy";
import { createStudent, addGuardian } from "@/lib/domain/academy-actions";

function initials(name: string) { return name.trim().slice(0, 2); }

export function StudentsBoard({ businessId, canWrite, canReadPii, students, guardians }: {
  businessId: string; canWrite: boolean; canReadPii: boolean; students: AcadStudent[]; guardians: AcadGuardian[];
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState<"active" | "all">("active");
  const [newOpen, setNewOpen] = React.useState(false);
  const [guardianFor, setGuardianFor] = React.useState<AcadStudent | null>(null);

  const byStudent = React.useMemo(() => {
    const m = new Map<string, AcadGuardian[]>();
    for (const g of guardians) m.set(g.studentId, [...(m.get(g.studentId) ?? []), g]);
    return m;
  }, [guardians]);

  const needle = q.trim().toLowerCase();
  const rows = students.filter((s) => (tab === "all" || s.active) && (!needle || s.name.toLowerCase().includes(needle) || (s.school ?? "").toLowerCase().includes(needle) || (byStudent.get(s.id) ?? []).some((g) => g.name.toLowerCase().includes(needle) || g.phone.includes(needle))));
  const activeCount = students.filter((s) => s.active).length;

  return (
    <>
      <PageHeader
        title="학생·보호자"
        description={canReadPii ? "학생 기본 정보와 보호자 연락처. 이름을 누르면 수강·출결·수강료 이력으로 이동합니다." : "보호자 연락처는 개인정보 조회(pii.read) 권한이 있어야 표시됩니다."}
        actions={canWrite ? <Button onClick={() => setNewOpen(true)}><Plus size={15} aria-hidden />학생 등록</Button> : undefined}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <FilterRow>
            <StatusTab active={tab === "active"} onClick={() => setTab("active")} count={activeCount}>재원</StatusTab>
            <StatusTab active={tab === "all"} onClick={() => setTab("all")} count={students.length}>전체</StatusTab>
          </FilterRow>
          <SearchBox value={q} onChange={setQ} placeholder={canReadPii ? "이름·학교·보호자·연락처" : "이름·학교"} />
        </div>
      </PageHeader>

      <Card className="p-4 sm:p-5">
        <CardHead title="학생 목록" description={`${rows.length}명`} />
        {students.length === 0 ? (
          <EmptyState title="등록된 학생이 없습니다." description="학생을 등록하고 반에 수강 등록하면 출결과 수강료가 이어집니다." action={canWrite ? <Button size="sm" variant="secondary" onClick={() => setNewOpen(true)}>학생 등록</Button> : undefined} />
        ) : rows.length === 0 ? (
          <EmptyState title="검색 결과가 없습니다." description={needle ? `"${q}" 에 해당하는 학생이 없습니다.` : "재원 중인 학생이 없습니다."} />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className={`${TABLE} min-w-[520px]`}>
              <thead>
                <tr className={THEAD}>
                  <th className={TH}>학생</th>
                  <th className={TH}>학교 · 학년</th>
                  <th className={TH}>{canReadPii ? "보호자" : "상태"}</th>
                  {canWrite && canReadPii && <th className={`${TH} text-right`}>동작</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const gs = byStudent.get(s.id) ?? [];
                  return (
                    <tr key={s.id} className={`${TR} h-[52px] hover:bg-sf2`}>
                      <td className={TD}>
                        <Link href={`/w/${businessId}/students/${s.id}`} className="flex min-h-[36px] items-center gap-2.5 rounded-[var(--r-sm)] [@media(pointer:coarse)]:min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sf2 text-[11px] font-semibold text-t2" aria-hidden>{initials(s.name)}</span>
                          <span className="min-w-0">
                            <CellName max={180} className="hover:underline">{s.name}</CellName>
                            {!s.active && <span className="block text-[11px] text-t3">퇴원</span>}
                          </span>
                        </Link>
                      </td>
                      <td className={`${TD} text-t2`}>{[s.school, s.grade].filter(Boolean).join(" · ") || <span className="text-t3">—</span>}</td>
                      <td className={`${TD} text-t2`}>
                        {canReadPii ? (
                          gs.length === 0 ? <span className="text-t3">없음</span> : (
                            <span className="flex flex-col">
                              {gs.slice(0, 2).map((g) => <span key={g.id} className="whitespace-nowrap"><span className="text-t">{g.name}</span>{g.relation ? <span className="text-[11.5px] text-t3"> {g.relation}</span> : null} <span className="tabular-nums">{g.phone}</span></span>)}
                              {gs.length > 2 && <span className="text-[11.5px] text-t3">외 {gs.length - 2}명</span>}
                            </span>
                          )
                        ) : (
                          <Badge kind={s.active ? "success" : "error"}>{s.active ? "재원" : "퇴원"}</Badge>
                        )}
                      </td>
                      {canWrite && canReadPii && (
                        <td className={`${TD} text-right`}>
                          <Button variant="ghost" size="sm" onClick={() => setGuardianFor(s)}><UserPlus size={13} aria-hidden />보호자 추가</Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewStudentModal businessId={businessId} open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); router.refresh(); }} />
      <GuardianModal businessId={businessId} student={guardianFor} onClose={() => setGuardianFor(null)} onCreated={() => { setGuardianFor(null); router.refresh(); }} />
    </>
  );
}

function NewStudentModal({ businessId, open, onClose, onCreated }: { businessId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = React.useState({ name: "", grade: "", school: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setForm({ name: "", grade: "", school: "" }); setError(null); } }, [open]);

  const submit = async () => {
    if (!form.name.trim()) { setError("이름을 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await createStudent(businessId, { ...form, name: form.name.trim() });
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      onCreated();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="학생 등록" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button onClick={submit} loading={busy}>등록</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
        {error && <Alert className="mb-4">{error}</Alert>}
        <Input label="이름" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        <div className="grid grid-cols-2 gap-x-3">
          <Input label="학교" value={form.school} onChange={(e) => setForm((f) => ({ ...f, school: e.target.value }))} wrapperClassName="mb-0" />
          <Input label="학년" value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))} placeholder="예: 중2" wrapperClassName="mb-0" />
        </div>
        <p className="mt-3 text-[12px] leading-snug text-t3">보호자 연락처는 등록 후 목록의 '보호자 추가'에서 붙입니다.</p>
      </form>
    </Modal>
  );
}

function GuardianModal({ businessId, student, onClose, onCreated }: { businessId: string; student: AcadStudent | null; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = React.useState({ name: "", phone: "", relation: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (student) { setForm({ name: "", phone: "", relation: "" }); setError(null); } }, [student]);

  const submit = async () => {
    if (!student) return;
    if (!form.name.trim() || !form.phone.trim()) { setError("보호자 이름과 연락처를 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await addGuardian(businessId, { studentId: student.id, name: form.name.trim(), phone: form.phone.trim(), relation: form.relation.trim() });
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      onCreated();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!student} onClose={onClose} title={student ? `${student.name} 보호자 추가` : "보호자 추가"} footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button onClick={submit} loading={busy}>저장</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
        {error && <Alert className="mb-4">{error}</Alert>}
        <Input label="보호자 이름" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        <Input label="연락처" required type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
        <Input label="관계" value={form.relation} onChange={(e) => setForm((f) => ({ ...f, relation: e.target.value }))} placeholder="예: 어머니" wrapperClassName="mb-0" />
      </form>
    </Modal>
  );
}
