/**
 * 안내 문구 생성(순수 함수, DB·네트워크 없음). 발송은 하지 않는다 — 화면이 복사/문자앱/Web Share 로 처리한다.
 *
 * 규칙
 *  · 금액은 호출부가 revenue.read 를 확인해 넣는다. null/undefined 면 금액 문장을 통째로 뺀다(문구에 "0원"이 찍히지 않게).
 *  · 시각은 ISO(UTC) 를 받아 사업장 시간대로 표기한다(기본 Asia/Seoul).
 *  · 종류: R1 렌탈 예약 확정·전날, R2 반납 지연 독촉, S1 미용실 내일 예약 확인, A2 학원 미납, A3 학원 결석·지각·조퇴,
 *         U 무인매장 유통기한 임박 요약(점주 메모용).
 *  · 자체검사: scripts/test-messages.mjs
 */
import { formatKRW } from "@/lib/domain/money";
import { DEFAULT_TZ, formatInTz } from "@/lib/utils/datetime";

const DT = "M월 d일(EEE) a h:mm";
const D = "M월 d일(EEE)";

function fmtDT(iso: string, tz = DEFAULT_TZ): string {
  return formatInTz(iso, tz, DT);
}
function fmtDateKey(key: string): string {
  // "YYYY-MM-DD" → "M월 d일(EEE)" (날짜 키는 시간대 변환 없이 그대로)
  return formatInTz(`${key}T00:00:00Z`, "UTC", D);
}
function honor(name: string | null | undefined, fallback: string): string {
  const n = (name ?? "").trim();
  return n ? `${n}님` : fallback;
}
function lines(parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join("\n");
}

// ── R1 렌탈 예약 확정 · 전날 안내 ─────────────────────────────────
export interface RentalReservationNoticeInput {
  businessName: string;
  customerName: string | null;
  periodStartIso: string;
  periodEndIso: string;
  fittingAtIso?: string | null;
  items: { label: string; qty: number }[];
  /** revenue.read 없으면 null → 금액 문장 생략 */
  deposit?: number | null;
  rentalFee?: number | null;
  /** policy_snapshot 의 연체 규정 요약(예: "1일당 10,000원"). 없으면 생략 */
  lateFeeRule?: string | null;
  tz?: string;
}

export function rentalReservationNotice(i: RentalReservationNoticeInput, when: "confirmed" | "day_before"): string {
  const tz = i.tz ?? DEFAULT_TZ;
  const head = when === "confirmed" ? "예약이 확정되었습니다." : "내일 대여 예정입니다. 잊지 마세요!";
  const itemsText = i.items.map((it) => `· ${it.label}${it.qty > 1 ? ` ×${it.qty}` : ""}`).join("\n");
  return lines([
    `[${i.businessName}] ${honor(i.customerName, "고객님")}, ${head}`,
    `대여: ${fmtDT(i.periodStartIso, tz)}`,
    `반납: ${fmtDT(i.periodEndIso, tz)}`,
    i.fittingAtIso ? `피팅: ${fmtDT(i.fittingAtIso, tz)}` : null,
    itemsText,
    i.rentalFee != null ? `대여료 ${formatKRW(i.rentalFee)}` : null,
    i.deposit != null ? `보증금 ${formatKRW(i.deposit)} (반납·검수 후 반환)` : null,
    i.lateFeeRule ? `연체 시 ${i.lateFeeRule}이 부과됩니다.` : null,
    "문의는 이 번호로 연락 주세요.",
  ]);
}

// ── R2 반납 지연 독촉 ─────────────────────────────────────────────
export interface RentalOverdueNoticeInput {
  businessName: string;
  customerName: string | null;
  periodEndIso: string;
  daysLate: number;
  /** revenue.read 없으면 null */
  lateFee?: number | null;
  tz?: string;
}

export function rentalOverdueNotice(i: RentalOverdueNoticeInput): string {
  const tz = i.tz ?? DEFAULT_TZ;
  return lines([
    `[${i.businessName}] ${honor(i.customerName, "고객님")}, 반납 예정일(${fmtDT(i.periodEndIso, tz)})이 ${i.daysLate}일 지났습니다.`,
    i.lateFee != null ? `현재 예상 연체료는 ${formatKRW(i.lateFee)}입니다.` : null,
    "빠른 반납 부탁드리며, 일정이 어려우시면 이 번호로 알려 주세요.",
  ]);
}

// ── S1 미용실 내일 예약 확인 ──────────────────────────────────────
export interface SalonReminderInput {
  businessName: string;
  customerName: string | null;
  startAtIso: string;
  serviceName: string | null;
  staffName?: string | null;
  /** revenue.read 없으면 null */
  price?: number | null;
  tz?: string;
}

export function salonReminderNotice(i: SalonReminderInput): string {
  const tz = i.tz ?? DEFAULT_TZ;
  return lines([
    `[${i.businessName}] ${honor(i.customerName, "고객님")}, 예약 안내드립니다.`,
    `일시: ${fmtDT(i.startAtIso, tz)}`,
    i.serviceName ? `시술: ${i.serviceName}${i.staffName ? ` (담당 ${i.staffName})` : ""}` : i.staffName ? `담당: ${i.staffName}` : null,
    i.price != null ? `예상 금액: ${formatKRW(i.price)}` : null,
    "변경·취소는 미리 연락 주시면 감사하겠습니다.",
  ]);
}

// ── A2 학원 미납 안내 ─────────────────────────────────────────────
export interface AcademyUnpaidInput {
  businessName: string;
  studentName: string;
  guardianName?: string | null;
  /** "YYYY-MM" */
  period: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
  /** revenue.read 없으면 null → 금액 생략 */
  outstanding?: number | null;
  /** 입금 계좌 문구(사업장 설정). 없으면 생략 */
  account?: string | null;
}

export function academyUnpaidNotice(i: AcademyUnpaidInput): string {
  const [y, m] = i.period.split("-");
  return lines([
    `[${i.businessName}] ${honor(i.guardianName, `${i.studentName} 학생 보호자님`)}, 안녕하세요.`,
    `${i.studentName} 학생의 ${Number(y)}년 ${Number(m)}월 수강료가 아직 확인되지 않았습니다.`,
    i.outstanding != null ? `미납액: ${formatKRW(i.outstanding)}` : null,
    `납부 기한: ${fmtDateKey(i.dueDate)}`,
    i.account ? `입금 계좌: ${i.account}` : null,
    "이미 납부하셨다면 이 문자는 무시해 주세요. 감사합니다.",
  ]);
}

// ── A3 학원 결석·지각·조퇴 안내 ──────────────────────────────────
export interface AcademyAttendanceInput {
  businessName: string;
  studentName: string;
  guardianName?: string | null;
  className?: string | null;
  /** "YYYY-MM-DD" */
  sessionDate: string;
  status: "결석" | "지각" | "조퇴";
  note?: string | null;
}

export function academyAttendanceNotice(i: AcademyAttendanceInput): string {
  const what = i.status === "결석" ? "결석하였습니다" : i.status === "지각" ? "지각하였습니다" : "조퇴하였습니다";
  return lines([
    `[${i.businessName}] ${honor(i.guardianName, `${i.studentName} 학생 보호자님`)}, 안녕하세요.`,
    `${i.studentName} 학생이 ${fmtDateKey(i.sessionDate)}${i.className ? ` ${i.className}` : ""} 수업에 ${what}.`,
    i.note ? `메모: ${i.note}` : null,
    i.status === "결석" ? "보강이 필요하시면 연락 주세요." : "확인 부탁드립니다.",
  ]);
}

// ── U 무인매장 유통기한 임박 요약(점주 메모·공유용) ────────────────
export interface UnmannedExpirySummaryInput {
  businessName: string;
  /** "YYYY-MM-DD" 기준일 */
  dateKey: string;
  lots: { productName: string; expiryDate: string; qty: number; unit?: string | null }[];
}

export function unmannedExpirySummary(i: UnmannedExpirySummaryInput): string {
  if (i.lots.length === 0) return `[${i.businessName}] ${fmtDateKey(i.dateKey)} 기준 유통기한 임박 품목이 없습니다.`;
  const sorted = [...i.lots].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  return lines([
    `[${i.businessName}] ${fmtDateKey(i.dateKey)} 기준 유통기한 임박 ${sorted.length}건`,
    ...sorted.map((l) => `· ${l.productName} — ${fmtDateKey(l.expiryDate)}까지, ${l.qty}${l.unit ?? "개"}`),
    "할인 표시 또는 폐기 처리가 필요합니다.",
  ]);
}

/** 문자앱 딥링크. iOS 는 `&body=`, 안드로이드는 `?body=` 를 쓴다 — 화면이 UA 로 고른다(실기기 미검증, 조사 문서 §7-0). */
export function smsHref(phone: string | null | undefined, body: string, platform: "ios" | "android" | "unknown" = "unknown"): string | null {
  const digits = (phone ?? "").replace(/[^0-9+]/g, "");
  if (!digits) return null;
  const sep = platform === "ios" ? "&" : "?";
  return `sms:${digits}${sep}body=${encodeURIComponent(body)}`;
}

export function telHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^0-9+]/g, "");
  return digits ? `tel:${digits}` : null;
}
