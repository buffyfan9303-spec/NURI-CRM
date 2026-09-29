/**
 * 매핑된 행 검증: 필수값, 역전 검침, 사용량 불일치, 호실 불일치, 중복, 이상치, 합계행 제외,
 * 은행 잔액 연속성·입금 후보 제시, 단위 불일치, 합계 대조.
 *
 * 2026-09-29 조사(docs/design-references/2026-09-29-building-cam-gap-research.md D-8) 반영:
 * V1 역전 검침, V2 사용량 불일치, V3 급증·급감(이상치), V4 호실 불일치(차단),
 * V6 중복 행(차단), V9 은행 잔액 연속, V10 은행 중복 거래(무시), V11 입금 후보(자동 배정 금지),
 * V12 단위 불일치(차단). V7(파일 중복)·V8(합계 대조 helper)은 아래 checkBatchTotal 참고.
 */
import { matchRoom, normalizePeriod, parseAmount, parseDate, parseDateTime } from "./normalize";
import type { MappingResult, RowIssue, SourceKind, ValidatedRow, ValidationContext } from "./types";

const AMOUNT_FIELDS = new Set([
  "baseFee",
  "usageFee",
  "vat",
  "totalAmount",
  "depositAmount",
  "withdrawAmount",
  "balance",
  "amount",
  "supplyAmount",
  "taxAmount",
  "waterFee",
  "sewerFee",
  "waterLevy",
]);
const DATE_FIELDS = new Set(["readDate", "dueDate"]);
const NUMBER_FIELDS = new Set(["prevReading", "currReading", "usage", "multiplier", "heatValue", "correction"]);

const REQUIRED_BY_SOURCE: Record<SourceKind, string[]> = {
  meter: ["room", "currReading"],
  bill: ["totalAmount"],
  bank: [],
  expense: ["amount"],
};

const SUMMARY_ROW_PATTERN = /^(합\s*계|소\s*계|총\s*계|계)$/;

function isSummaryRow(row: string[]): boolean {
  const nonEmpty = row.map((c) => c.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return false;
  return nonEmpty.some((c) => SUMMARY_ROW_PATTERN.test(c));
}

function normalizeField(field: string, raw: string): string | number | null {
  if (!raw.trim()) return null;
  if (AMOUNT_FIELDS.has(field)) return parseAmount(raw);
  if (DATE_FIELDS.has(field)) return parseDate(raw);
  if (field === "txnDatetime") return parseDateTime(raw);
  if (field === "period") return normalizePeriod(raw);
  if (NUMBER_FIELDS.has(field)) {
    const n = Number(raw.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return raw.trim();
}

/** 금액에 소수점이 있으면 원 단위로 반올림하되 D-7 규칙대로 경고를 남긴다(자동 반올림 금지 대신 사용자 확인). */
function hasDecimalAmount(raw: string): boolean {
  const body = raw.replace(/[,()원\s-]/g, "");
  return /^\d+\.\d+$/.test(body);
}

/** 은행 거래 중복(V10): 계좌·거래일시·금액·적요·잔액이 모두 같으면 동일 거래로 보고 두 번째부터 무시한다. */
function bankDupKey(values: Record<string, string>): string {
  return [values.txnDatetime, values.depositAmount, values.withdrawAmount, values.depositor, values.balance]
    .map((v) => (v ?? "").trim())
    .join("::");
}

export function validateRows(
  rows: string[][],
  mapping: MappingResult,
  context: ValidationContext = {},
): ValidatedRow[] {
  const { sourceKind } = mapping;
  const result: ValidatedRow[] = [];
  const seenKeys = new Set<string>();
  const seenBankKeys = new Set<string>();
  const usageValues: { idx: number; usage: number }[] = [];
  let runningBalance = context.openingBalance ?? null;

  rows.forEach((row, rowIndex) => {
    const isEmpty = row.every((c) => !c.trim());
    if (isEmpty) return;

    if (isSummaryRow(row)) {
      result.push({ rowIndex, values: {}, normalized: {}, issues: [], excluded: true });
      return;
    }

    const values: Record<string, string> = {};
    const normalized: Record<string, string | number | null> = {};
    for (const [field, col] of Object.entries(mapping.mapping)) {
      const raw = row[col] ?? "";
      values[field] = raw;
      normalized[field] = normalizeField(field, raw);
    }

    // 은행 중복 거래(V10): 완전히 같은 거래는 조용히 무시(두 번째부터 제외).
    if (sourceKind === "bank") {
      const bk = bankDupKey(values);
      if (bk.trim().length > 0 && seenBankKeys.has(bk)) {
        result.push({ rowIndex, values, normalized, issues: [], excluded: true });
        return;
      }
      seenBankKeys.add(bk);
    }

    const issues: RowIssue[] = [];

    for (const field of REQUIRED_BY_SOURCE[sourceKind]) {
      if (normalized[field] == null || normalized[field] === "") {
        issues.push({ rowIndex, field, level: "error", code: "MISSING_REQUIRED", message: `필수값 누락: ${field}` });
      }
    }

    if (sourceKind === "bank" && normalized.depositAmount == null && normalized.withdrawAmount == null) {
      issues.push({
        rowIndex,
        level: "error",
        code: "MISSING_REQUIRED",
        message: "입금액/출금액 중 하나는 있어야 합니다.",
      });
    }

    // D-7 형식 규칙: 금액에 소수점이 있으면 반올림하되 사용자 확인이 필요하다고 경고한다.
    for (const field of Object.keys(mapping.mapping)) {
      if (AMOUNT_FIELDS.has(field) && values[field] && hasDecimalAmount(values[field])) {
        issues.push({
          rowIndex,
          field,
          level: "warning",
          code: "AMOUNT_DECIMAL_ROUNDED",
          message: `${field} 값(${values[field]})에 소수점이 있어 원 단위로 반올림했습니다. 확인해 주세요.`,
        });
      }
    }

    let roomKey: string | null = null;
    if ("room" in mapping.mapping) {
      const raw = values.room ?? "";
      if (raw.trim()) {
        const m = matchRoom(raw, context.units);
        roomKey = m.key;
        normalized.room = m.key;
        if (m.matchType === "none" && context.units?.length) {
          // V4 호실 불일치: 건물에 없는 호실은 차단하고 가져오지 않는다.
          issues.push({ rowIndex, field: "room", level: "error", code: "ROOM_UNMATCHED", message: `호실을 목록에서 찾을 수 없습니다: ${raw}` });
        } else if (m.matchType === "fuzzy") {
          issues.push({ rowIndex, field: "room", level: "warning", code: "ROOM_FUZZY", message: `호실 "${raw}"을(를) "${m.matched}"(으)로 추정했습니다.` });
        }
      }
    }

    if (sourceKind === "meter" || sourceKind === "bill") {
      // V12 단위 불일치: 건물 계량기 단위와 파일 단위가 다르면 차단.
      const fileUnit = values.unit?.trim();
      if (context.expectedUnit && fileUnit && fileUnit.toLowerCase() !== context.expectedUnit.toLowerCase()) {
        issues.push({
          rowIndex,
          field: "unit",
          level: "error",
          code: "UNIT_MISMATCH",
          message: `단위가 다릅니다(파일: ${fileUnit}, 계량기: ${context.expectedUnit}).`,
        });
      }
    }

    if (sourceKind === "meter") {
      const prev = typeof normalized.prevReading === "number" ? normalized.prevReading : context.prevReadings?.[roomKey ?? ""];
      const curr = typeof normalized.currReading === "number" ? normalized.currReading : null;
      const multiplier = typeof normalized.multiplier === "number" ? normalized.multiplier : 1;
      if (typeof prev === "number" && typeof curr === "number") {
        if (curr < prev) {
          // V1 역전 검침: 차단하고 사유(교체/한바퀴 돔/오입력) 입력 후 통과해야 한다.
          issues.push({ rowIndex, field: "currReading", level: "error", code: "REVERSED_READING", message: "당월 지침이 전월보다 작습니다(역전 검침) — 계량기 교체/한 바퀴 돔/오입력 중 사유를 선택해야 통과됩니다." });
        }
        const expectedUsage = (curr - prev) * multiplier;
        const rawUsage = typeof normalized.usage === "number" ? normalized.usage : null;
        if (rawUsage != null && Math.abs(rawUsage - expectedUsage) > 0.01) {
          issues.push({ rowIndex, field: "usage", level: "warning", code: "USAGE_MISMATCH", message: `사용량(${rawUsage})이 (당월-전월)×배율(${expectedUsage})과 다릅니다.` });
        }
        if (typeof normalized.usage !== "number") normalized.usage = expectedUsage;
      }
      if (typeof normalized.usage === "number") usageValues.push({ idx: result.length, usage: normalized.usage });
    }

    if (sourceKind === "bank") {
      const deposit = typeof normalized.depositAmount === "number" ? normalized.depositAmount : 0;
      const withdraw = typeof normalized.withdrawAmount === "number" ? normalized.withdrawAmount : 0;
      const balance = typeof normalized.balance === "number" ? normalized.balance : null;
      // V9 잔액 연속성: 앞 행 잔액 ± 이번 거래 금액 = 이번 행 잔액.
      if (runningBalance != null && balance != null) {
        const expected = runningBalance + deposit - withdraw;
        if (Math.abs(expected - balance) > 0.5) {
          issues.push({ rowIndex, field: "balance", level: "warning", code: "BALANCE_MISMATCH", message: `잔액 연속성이 맞지 않습니다(예상 ${expected}, 실제 ${balance}) — 누락 거래가 있을 수 있습니다.` });
        }
      }
      if (balance != null) runningBalance = balance;

      // 서버 확정(0033 C7)은 거래일시를 못 읽은 입금 행을 건너뛴다. 가져온 시각으로 대체하지 않으므로 미리 알린다.
      if (deposit > 0 && normalized.txnDatetime == null) {
        const rawDt = (values.txnDatetime ?? "").trim();
        issues.push({
          rowIndex, field: "txnDatetime", level: "warning", code: "TXN_DATE_MISSING",
          message: rawDt ? `거래일시(${rawDt})를 읽지 못해 확정 때 건너뜁니다.` : "거래일시가 없어 확정 때 건너뜁니다.",
        });
      }

      // V11 입금 후보: 적요/입금자명과 청구액이 일치하면 후보로만 제시한다(자동 배정 금지 — normalized.room을 세팅하지 않는다).
      if (deposit > 0 && context.expectedCharges) {
        const payerText = (values.depositor ?? "").trim();
        for (const [candidateRoom, amount] of Object.entries(context.expectedCharges)) {
          if (amount === deposit && payerText && payerText.includes(matchRoom(candidateRoom).key)) {
            issues.push({
              rowIndex,
              field: "depositAmount",
              level: "warning",
              code: "DEPOSIT_CANDIDATE",
              message: `${candidateRoom} 청구액(${amount}원)과 금액이 일치합니다 — 배정 후보(자동 배정 아님, 확인 후 연결하세요).`,
            });
          }
        }
      }
    }

    const dupKeyParts = [roomKey, values.meterNo, values.customerNo, values.txnId, context.period].filter(Boolean);
    if (dupKeyParts.length > 0) {
      const dupKey = dupKeyParts.join("::");
      if (seenKeys.has(dupKey)) {
        // V6 중복 행: 같은 호실/계량기/기간이 2행 이상이면 차단.
        issues.push({ rowIndex, level: "error", code: "DUPLICATE_ROW", message: "같은 파일 안에 동일한 키의 행이 이미 있습니다." });
      }
      seenKeys.add(dupKey);
    }

    result.push({ rowIndex, values, normalized, issues, excluded: false });
  });

  // V3 이상치: 파일 내 사용량 중앙값의 3배 초과(급증·급감 1차 근사 — 정밀 기준은 전월/전년동월 대비, context 확장 시 개선).
  if (usageValues.length >= 3) {
    const sorted = [...usageValues].map((v) => v.usage).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > 0) {
      for (const { idx, usage } of usageValues) {
        if (usage > median * 3) {
          result[idx].issues.push({
            rowIndex: result[idx].rowIndex,
            field: "usage",
            level: "warning",
            code: "OUTLIER_USAGE",
            message: `사용량(${usage})이 파일 내 중앙값(${median})의 3배를 초과합니다.`,
          });
        }
      }
    }
  }

  return result;
}

/** V8 합계 대조: 원 고지서 총액(사용자 입력)과 파일 금액 합계를 비교한다. 자동 수정하지 않고 차액만 알려준다. */
export function checkBatchTotal(
  validated: ValidatedRow[],
  field: string,
  expectedTotal: number,
): RowIssue | null {
  const sum = validated
    .filter((r) => !r.excluded)
    .reduce((acc, r) => acc + (typeof r.normalized[field] === "number" ? (r.normalized[field] as number) : 0), 0);
  if (sum === expectedTotal) return null;
  return {
    rowIndex: -1,
    field,
    level: "warning",
    code: "TOTAL_MISMATCH",
    message: `파일 합계(${sum}원)가 입력한 고지서 총액(${expectedTotal}원)과 다릅니다(차액 ${expectedTotal - sum}원).`,
  };
}
