"use client";

/**
 * 학생 상세 — 기본정보(+보호자 연락처, pii.read 게이팅) + 수강 이력 + 출결 이력 + 수강료·미납
 * (revenue.read 게이팅). rental/CustomerDetail.tsx와 같은 구조를 따른다 — 새 패턴을 만들지 않는다.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Lock, Banknote, KeyRound } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard } from "@/components/ui/ResponsiveTable";
import { BackLink, CardHead, Alert, TABLE, THEAD, TH, TR, TR_CLICK, TD, CONTROL } from "@/components/rental/listkit";
import type { AcadStudent, AcadGuardian, AcadEnrollmentDetail, AcadAttendanceDetail, AcadInvoiceBalance, AcadClass } from "@/lib/domain/academy";
import { enrollStudent, setStudentCheckinCode } from "@/lib/domain/academy-actions";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { formatKRW } from "@/lib/domain/money";
import { INVOICE_STATUS_KIND, AcadPayModal } from "./TuitionBoard";

const ENROLLMENT_STATUS_KIND: Record<string, BadgeKind> = { 활성: "success", 휴원: "warning", 퇴원: "error" };
export const ATTENDANCE_STATUS_KIND: Record<string, BadgeKind> = { 출석: "success", 지각: "warning", 조퇴: "warning", 결석: "error" };

export function StudentDetail({
  businessId,
  student,
  canReadPii,
  canRevenue,
  canWrite,
  guardians,
  guardiansError,
  enrollments,
  attendance,
  invoices,
  invoicesError,
  classesForEnroll,
}: {
  businessId: string;
  student: AcadStudent;
  canReadPii: boolean;
  canRevenue: boolean;
  canWrite: boolean;
  guardians: AcadGuardian[];
  guardiansError: string | null;
  enrollments: AcadEnrollmentDetail[];
  attendance: AcadAttendanceDetail[];
  invoices: AcadInvoiceBalance[];
  invoicesError: string | null;
  classesForEnroll: AcadClass[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [enrollClassId, setEnrollClassId] = React.useState("");
  const [payFor, setPayFor] = React.useState<(AcadInvoiceBalance & { studentName?: string }) | null>(null);
  const [checkinCode, setCheckinCode] = React.useState(student.checkinCode ?? "");
  const [codeBusy, setCodeBusy] = React.useState(false);
  const [codeError, setCodeError] = React.useState<string | null>(null);

  const saveCheckinCode = async (value: string) => {
    setCodeBusy(true); setCodeError(null);
    try {
      const r = await setStudentCheckinCode(businessId, student.id, value.trim() || null);
      if (!r.ok) { setCodeError(r.message); return; }
      router.refresh();
    } catch {
      setCodeError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setCodeBusy(false);
    }
  };

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return false; }
      router.refresh();
      return true;
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
      return false;
    } finally { setBusy(false); }
  };

  const present = attendance.filter((a) => a.status === "출석").length;
  const rate = attendance.length ? Math.round((present / attendance.length) * 100) : null;
  const activeEnroll = enrollments.filter((e) => e.status === "활성").length;
  const outstanding = invoices.reduce((s, i) => s + i.outstanding, 0);
  const noWrite = canWrite ? undefined : "수강 등록 권한(write)이 없습니다. 사업장 관리자에게 요청하세요.";

  return (
    <>
      <BackLink href={`/w/${businessId}/students`}>학생 목록</BackLink>
      <PageHeader
        title={student.name}
        description={[student.school, student.grade].filter(Boolean).join(" · ") || "학교·학년 미입력"}
        meta={<Badge kind={student.active ? "success" : "error"}>{student.active ? "재원" : "퇴원"}</Badge>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4">
        {[
          ["수강 중인 반", `${activeEnroll}개`, "text-t"],
          ["출석률", rate === null ? "—" : `${rate}%`, rate !== null && rate < 80 ? "text-wt" : "text-t"],
          ["출결 기록", `${attendance.length}건`, "text-t"],
          canRevenue ? ["미수 잔액", formatKRW(outstanding), outstanding > 0 ? "text-et" : "text-t"] : ["보호자", canReadPii ? `${guardians.length}명` : "비공개", "text-t"],
        ].map(([l, v, cls]) => (
          <Card key={l} className="min-w-0 px-4 py-3.5">
            <p className="text-[12px] text-t2">{l}</p>
            <p className={`mt-1.5 truncate text-[22px] font-bold leading-none tabular-nums ${cls}`}>{v}</p>
          </Card>
        ))}
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <CardHead title="기본 정보" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[13px]">
              <dt className="text-t3">학교·학년</dt>
              <dd className="text-t">{[student.school, student.grade].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-t3">보호자</dt>
              <dd className="min-w-0 text-t">
                {!canReadPii ? (
                  <span className="inline-flex items-center gap-1 text-t3"><Lock size={11} aria-hidden /> 비공개(pii.read 권한 필요)</span>
                ) : guardiansError ? (
                  <span className="text-et">불러오지 못했습니다: {guardiansError}</span>
                ) : guardians.length === 0 ? (
                  <span className="text-t3">등록된 보호자가 없습니다.</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {guardians.map((g) => (
                      <li key={g.id} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{g.name}</span>
                        <span className="text-[12px] text-t3">{g.relation ?? "보호자"}</span>
                        <a href={`tel:${g.phone}`} className="tabular-nums text-[var(--accent-ink)] hover:underline">{g.phone}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
              {student.memo && (
                <>
                  <dt className="text-t3">메모</dt>
                  <dd className="whitespace-pre-wrap text-t">{student.memo}</dd>
                </>
              )}
            </dl>
          </Card>

          {canReadPii && (
            <Card className="p-4 sm:p-5">
              <CardHead title="등원 코드" description="키오스크에서 학생이 직접 입력하는 숫자 4~6자리" />
              {canWrite ? (
                <form onSubmit={(e) => { e.preventDefault(); saveCheckinCode(checkinCode); }} className="flex flex-wrap items-center gap-2">
                  <span className="relative">
                    <KeyRound size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-t3" aria-hidden />
                    <input
                      value={checkinCode}
                      onChange={(e) => setCheckinCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                      placeholder="숫자 4~6자리"
                      inputMode="numeric"
                      aria-label="등원 코드"
                      className={`${CONTROL} w-[160px] pl-8 tracking-[3px] tabular-nums`}
                    />
                  </span>
                  <Button type="submit" variant="secondary" loading={codeBusy} disabled={checkinCode === (student.checkinCode ?? "")}>저장</Button>
                  {student.checkinCode && (
                    <Button type="button" variant="ghost" loading={codeBusy} onClick={() => { setCheckinCode(""); saveCheckinCode(""); }}>해제</Button>
                  )}
                </form>
              ) : (
                <p className="text-[13px] tabular-nums text-t">{student.checkinCode ?? <span className="text-t3">설정 안 됨</span>}</p>
              )}
              {codeError && <Alert className="mt-3">{codeError}</Alert>}
            </Card>
          )}
        </div>

        <Card className="p-4 sm:p-5">
          <CardHead title="수강 이력" description="행을 누르면 반·수강등록으로 이동" />
          {enrollments.length === 0 ? (
            <EmptyState title="수강 이력이 없습니다." description="이 학생이 등록된 반이 아직 없습니다." />
          ) : (
            <TableOrCards
              rows={enrollments}
              keyOf={(e) => e.id}
              table={
                <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                  <table className={`${TABLE} min-w-[560px]`}>
                    <thead>
                      <tr className={THEAD}>
                        <th className={TH}>반</th>
                        <th className={TH}>과목</th>
                        <th className={TH}>등록일</th>
                        <th className={TH}>상태</th>
                        <th className={`${TH} text-right`}>수강료</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.map((e) => (
                        <tr key={e.id} onClick={() => router.push(`/w/${businessId}/classes`)} className={`${TR_CLICK} h-[52px]`}>
                          <td className={`${TD} font-medium text-t`}><Link href={`/w/${businessId}/classes`} onClick={(ev) => ev.stopPropagation()} className="inline-flex items-center hover:underline [@media(pointer:coarse)]:min-h-[44px]">{e.className}</Link></td>
                          <td className={`${TD} text-t2`}>{e.subject ?? "—"}</td>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{formatInTz(e.enrolledAt, DEFAULT_TZ, "yyyy.MM.dd")}</td>
                          <td className={TD}><Badge kind={ENROLLMENT_STATUS_KIND[e.status] ?? "info"}>{e.status}</Badge></td>
                          <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>{formatKRW(e.tuitionSnapshot)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
              card={(e) => (
                <MobileCard
                  title={e.className}
                  sub={e.subject ?? undefined}
                  badge={<Badge kind={ENROLLMENT_STATUS_KIND[e.status] ?? "info"}>{e.status}</Badge>}
                  onClick={() => router.push(`/w/${businessId}/classes`)}
                  fields={[["등록일", formatInTz(e.enrolledAt, DEFAULT_TZ, "yyyy.MM.dd")], ["수강료", formatKRW(e.tuitionSnapshot)]]}
                />
              )}
            />
          )}

          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (!canWrite) return;
              if (!enrollClassId) { setError("등록할 반을 선택하세요."); return; }
              const ok = await run(() => enrollStudent(businessId, enrollClassId, student.id));
              if (ok) setEnrollClassId("");
            }}
            className="mt-4 flex flex-col gap-2 border-t border-[var(--bd)] pt-4 sm:flex-row sm:items-center"
          >
            <label htmlFor="enroll-class" className="text-[13px] font-medium text-t2 sm:w-[96px] sm:shrink-0">새 수강 등록</label>
            <select
              id="enroll-class"
              value={enrollClassId}
              onChange={(ev) => setEnrollClassId(ev.target.value)}
              disabled={!canWrite}
              title={noWrite}
              className={`${CONTROL} sm:max-w-[320px]`}
            >
              <option value="">반 선택</option>
              {classesForEnroll.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.subject ? ` · ${c.subject}` : ""}</option>
              ))}
            </select>
            <Button type="submit" loading={busy} disabled={!canWrite} title={noWrite} className="sm:shrink-0">
              <Plus size={14} aria-hidden />수강 등록
            </Button>
          </form>
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHead title="출결 이력" description={attendance.length > 0 ? `${attendance.length}건 · 출석 ${present}건` : undefined} />
          {attendance.length === 0 ? (
            <EmptyState title="출결 기록이 없습니다." description="이 학생의 출결이 아직 기록되지 않았습니다." />
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className={`${TABLE} min-w-[360px]`}>
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>회차 날짜</th>
                    <th className={TH}>반</th>
                    <th className={`${TH} text-right`}>출결</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((a) => (
                    <tr key={a.id} className={`${TR} h-[44px]`}>
                      <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{a.sessionDate}</td>
                      <td className={`${TD} text-t`}>{a.className}</td>
                      <td className={`${TD} text-right`}><Badge kind={ATTENDANCE_STATUS_KIND[a.status] ?? "info"}>{a.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {canRevenue ? (
          <Card className="p-4 sm:p-5">
            <CardHead title="수강료·미납" description="이 학생의 수강 등록에 발행된 청구서" />
            {invoicesError ? (
              <Alert>청구 내역을 불러오지 못했습니다: {invoicesError}</Alert>
            ) : invoices.length === 0 ? (
              <EmptyState title="발행된 청구서가 없습니다." />
            ) : (
              <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className={`${TABLE} min-w-[520px]`}>
                  <thead>
                    <tr className={THEAD}>
                      <th className={TH}>청구월</th>
                      <th className={`${TH} text-right`}>청구</th>
                      <th className={`${TH} text-right`}>미수</th>
                      <th className={`${TH} text-right`}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.invoiceId} className={`${TR} h-[52px]`}>
                        <td className={`${TD} whitespace-nowrap tabular-nums text-t`}>{inv.period}<span className="block text-[11.5px] text-t3">기한 {inv.dueDate}</span></td>
                        <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>{formatKRW(inv.amount)}<span className="block text-[11.5px] text-t3">납부 {formatKRW(inv.paid)}</span></td>
                        <td className={`${TD} whitespace-nowrap text-right tabular-nums ${inv.outstanding > 0 ? "font-semibold text-et" : "text-t3"}`}>{formatKRW(inv.outstanding)}</td>
                        <td className={`${TD} text-right`}>
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <Badge kind={INVOICE_STATUS_KIND[inv.status] ?? "info"}>{inv.status}</Badge>
                            {canWrite && inv.outstanding > 0 && (
                              <Button variant="secondary" size="sm" onClick={() => setPayFor({ ...inv, studentName: student.name })}><Banknote size={13} aria-hidden />납부</Button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-4 sm:p-5">
            <CardHead title="수강료·미납" />
            <p className="flex items-center gap-1.5 text-[12.5px] text-t3"><Lock size={13} aria-hidden /> 수강료·미납 조회(revenue.read) 권한이 없어 표시되지 않습니다.</p>
          </Card>
        )}
      </div>

      <AcadPayModal businessId={businessId} target={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); router.refresh(); }} />
    </>
  );
}
