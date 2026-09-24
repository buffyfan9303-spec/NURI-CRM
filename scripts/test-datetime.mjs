#!/usr/bin/env node
// lib/utils/datetime.ts 자체 검증 — Node가 erasable TS 문법을 네이티브로 실행하므로
// 별도 빌드/러너 없이 .ts를 직접 import한다(Node 22.6+/24 기본 지원, 새 패키지 불필요).
// 실행: node scripts/test-datetime.mjs
import assert from "node:assert/strict";
import {
  dayKeyInTz,
  eventDayKey,
  overlaps,
  monthGrid,
  weekKeysContaining,
  startOfDayInTz,
  endOfDayExclusiveInTz,
  addDaysToKey,
  addMonthsToKey,
  formatInTz,
  todayKeyInTz,
  localDateTimeToUtcIso,
} from "../lib/utils/datetime.ts";

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}`);
    console.log(`      ${e.message}`);
    process.exitCode = 1;
  }
}

const TZ = "Asia/Seoul";

// ── KST 자정 경계: UTC로는 2/28 15시인데 2026-02-28이 나오면 실패 ──
check("KST 자정(2026-03-01T00:00:00+09:00) → dayKey 2026-03-01", () => {
  assert.equal(dayKeyInTz("2026-03-01T00:00:00+09:00", TZ), "2026-03-01");
});

// ── KST 오전 8시(=UTC 전날 23시) → dayKey는 당일이어야 한다 ──
check("KST 08:00(=UTC 전날 23:00) → dayKey 당일", () => {
  assert.equal(dayKeyInTz("2026-03-01T08:00:00+09:00", TZ), "2026-03-01");
  assert.equal(dayKeyInTz("2026-02-28T23:00:00Z", TZ), "2026-03-01");
});

// ── 종일 이벤트: event_date가 tz 변환으로 전날이 되면 안 된다 ──
check("종일 이벤트 event_date=2026-06-01 → 어떤 tz에서도 5/31로 안 밀림", () => {
  assert.equal(
    eventDayKey({ allDay: true, eventDate: "2026-06-01", startsAt: null }, "Asia/Seoul"),
    "2026-06-01"
  );
  // 서쪽(음의 오프셋) 극단 타임존으로도 절대 변하지 않아야 한다 — event_date는 tz 변환을 안 거치므로.
  assert.equal(
    eventDayKey({ allDay: true, eventDate: "2026-06-01", startsAt: null }, "America/Los_Angeles"),
    "2026-06-01"
  );
});

// ── overlaps: 반개구간 규칙 ──
check("overlaps: [10:00,11:00) vs [11:00,12:00) → false(끝점 맞닿음)", () => {
  const day = "2026-01-05T";
  assert.equal(
    overlaps(day + "10:00:00+09:00", day + "11:00:00+09:00", day + "11:00:00+09:00", day + "12:00:00+09:00"),
    false
  );
});
check("overlaps: [10:00,11:00) vs [10:59,11:30) → true", () => {
  const day = "2026-01-05T";
  assert.equal(
    overlaps(day + "10:00:00+09:00", day + "11:00:00+09:00", day + "10:59:00+09:00", day + "11:30:00+09:00"),
    true
  );
});

// ── 월 그리드: 항상 42칸, 월요일 시작 일관 ──
check("monthGrid: 6주×7일=42칸, 각 행 월~일 순서", () => {
  const grid = monthGrid(2026, 3, TZ);
  assert.equal(grid.length, 6);
  for (const week of grid) {
    assert.equal(week.length, 7);
    for (let i = 0; i < 7; i++) {
      const weekday = new Date(week[i] + "T00:00:00Z").getUTCDay(); // 0=일..6=토
      const expected = (i + 1) % 7; // i=0→월(1) … i=6→일(0)
      assert.equal(weekday, expected, `week[${i}]=${week[i]} 요일 불일치`);
    }
  }
  // 3월 1일(2026년, 일요일)이 그리드 안에 있어야 한다
  assert.ok(grid.flat().includes("2026-03-01"));
});

check("weekKeysContaining: 7개 연속 날짜, 월요일 시작", () => {
  const week = weekKeysContaining("2026-03-04"); // 수요일
  assert.equal(week.length, 7);
  assert.equal(new Date(week[0] + "T00:00:00Z").getUTCDay(), 1);
  assert.equal(week[0], "2026-03-02");
  assert.equal(week[6], "2026-03-08");
});

// ── startOfDayInTz / endOfDayExclusiveInTz 왕복 ──
check("startOfDayInTz/endOfDayExclusiveInTz: KST 00:00 = UTC 전날 15:00", () => {
  assert.equal(startOfDayInTz("2026-03-01", TZ), "2026-02-28T15:00:00.000Z");
  assert.equal(endOfDayExclusiveInTz("2026-03-01", TZ), "2026-03-01T15:00:00.000Z");
  assert.equal(endOfDayExclusiveInTz("2026-03-01", TZ), startOfDayInTz("2026-03-02", TZ));
});

// ── 날짜 키 산술: 시스템 타임존 영향 없이 정확해야 함 ──
check("addDaysToKey: 평년 2월 말 경계", () => {
  assert.equal(addDaysToKey("2026-02-28", 1), "2026-03-01");
});
check("addMonthsToKey: 말일 보정(1/31 +1개월 → 2/28, 2026은 평년)", () => {
  assert.equal(addMonthsToKey("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsToKey("2026-01-31", -1), "2025-12-31");
});

// ── formatInTz ──
check("formatInTz: yyyy-MM-dd HH:mm", () => {
  assert.equal(formatInTz("2026-03-01T00:00:00+09:00", TZ, "yyyy-MM-dd HH:mm"), "2026-03-01 00:00");
});

// ── todayKeyInTz: 형식만 검증(값은 실행 시점에 따라 달라짐) ──
check("todayKeyInTz: YYYY-MM-DD 형식", () => {
  assert.match(todayKeyInTz(TZ), /^\d{4}-\d{2}-\d{2}$/);
});

check("localDateTimeToUtcIso: 폼 입력(날짜+시간, tz) → UTC ISO", () => {
  assert.equal(localDateTimeToUtcIso("2026-03-01", "09:30", TZ), "2026-03-01T00:30:00.000Z");
});

console.log("\n" + "─".repeat(50));
console.log(`총 ${pass}건 PASS${process.exitCode ? " · 일부 FAIL" : " · 전부 통과"}`);
