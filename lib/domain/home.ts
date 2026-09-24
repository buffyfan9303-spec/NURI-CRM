/**
 * 업종 홈(업무 홈) 대시보드가 공유하는 유틸.
 *
 * "지표 숫자 → 필터 적용된 목록"이 항상 같은 건수를 보여주려면, 지표를 계산할 때 쓰는
 * "오늘"의 tz 경계와 목록 화면이 쿼리 파라미터로 받는 경계가 반드시 같은 계산이어야 한다.
 * 이 파일은 그 계산을 한 곳에 모은다 — rental.ts가 쓰던 자체 +9h 고정 계산(Seoul 전용)을
 * 없애고, 이미 검증된 lib/utils/datetime.ts(Intl 기반, 임의 tz 지원)로 통일한다.
 */
import { todayKeyInTz, startOfDayInTz, endOfDayExclusiveInTz } from "@/lib/utils/datetime";

export interface TodayRange {
  /** 사업장 tz 기준 오늘 날짜 키(YYYY-MM-DD). */
  todayKey: string;
  /** 오늘 00:00:00(tz)의 UTC ISO 순간. */
  startISO: string;
  /** 내일 00:00:00(tz)의 UTC ISO 순간 — [start,end) 반개구간의 배타적 끝. */
  endISO: string;
}

export function todayRangeISO(tz: string): TodayRange {
  const todayKey = todayKeyInTz(tz);
  return {
    todayKey,
    startISO: startOfDayInTz(todayKey, tz),
    endISO: endOfDayExclusiveInTz(todayKey, tz),
  };
}

/** 홈 상단 지표 한 칸. count===0이면 링크가 있어도 톤은 항상 neutral로 그린다(§5.5). */
export interface HomeMetric {
  key: string;
  label: string;
  count: number;
  href?: string;
  tone?: "neutral" | "warn" | "alert";
}
