#!/usr/bin/env node
// 결함 회귀 검증: "일정이 0건이면 달력 뷰 전체가 EmptyState로 대체된다" 버그가
// 다시 생기지 않는지 확인한다(요일·날짜 격자·오늘·주말·기간 이동·등록 경로가
// events.length===0일 때도 항상 남아 있어야 한다 — §5.6/§11-4).
//
// 두 종류의 검사를 합친다:
//   1) 정적 검사 — 뷰 컴포넌트 소스에 "events.length===0이면 그리드 대신 EmptyState류를
//      반환"하는 분기가 없는지(문자열/정규식 기반, 새 파서 의존성 없이).
//   2) 로직 검사 — 달력 격자(월 6주=42칸, 주 7일, 일 1일)는 이벤트 배열과 무관하게
//      항상 같은 길이로 만들어지는지(순수 함수 monthGrid/computeRange/groupEventsByDay로 확인).
//
// 실행: node scripts/test-calendar-empty.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { register } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// lib/domain/calendar-shared.ts와 components/calendar/shared.ts는 tsconfig의 "@/*" 별칭으로
// 서로를 import한다. Node 기본 ESM 리졸버는 그 별칭을 모르므로, 새 패키지 없이 표준 loader
// 훅(scripts/alias-loader.mjs) 하나만 등록해서 푼다.
register(pathToFileURL(path.join(__dirname, "alias-loader.mjs")).href, import.meta.url);

const { monthGrid } = await import("../lib/utils/datetime.ts");
const { computeRange } = await import("../lib/domain/calendar-shared.ts");
const { groupEventsByDay } = await import("../components/calendar/shared.ts");

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

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

/* ────────────────────────────────────────────────────────────
   1) 정적 검사 — "빈 결과 = 화면 없음" 패턴이 다시 들어왔는지
   ──────────────────────────────────────────────────────────── */

const calendarClientSrc = read("components/calendar/CalendarClient.tsx");
const monthViewSrc = read("components/calendar/MonthView.tsx");
const weekViewSrc = read("components/calendar/WeekView.tsx");
const dayViewSrc = read("components/calendar/DayView.tsx");
const timeGridSrc = read("components/calendar/TimeGrid.tsx");
const listViewSrc = read("components/calendar/ListView.tsx");

check("CalendarClient.tsx: 더 이상 EmptyState를 import하지 않는다(뷰 대체 제거)", () => {
  assert.ok(
    !/import\s*\{[^}]*EmptyState[^}]*\}\s*from\s*["']@\/components\/ui\/EmptyState["']/.test(calendarClientSrc),
    "EmptyState import가 남아있다 — 뷰 전체를 대체하는 옛 분기가 되돌아왔을 수 있다"
  );
});

check("CalendarClient.tsx: bodyByState()가 events.length===0으로 뷰를 통째로 바꾸지 않는다", () => {
  const start = calendarClientSrc.indexOf("const bodyByState = () => {");
  assert.ok(start >= 0, "bodyByState 함수를 찾지 못했다(구조가 바뀌었으면 이 검사도 갱신 필요)");
  // 함수 본문을 대략 다음 최상위 "};"까지로 잘라 그 구간만 검사한다.
  const end = calendarClientSrc.indexOf("\n  };", start);
  const body = calendarClientSrc.slice(start, end >= 0 ? end : undefined);
  assert.ok(
    !/events\.length\s*===\s*0/.test(body),
    "bodyByState 안에 events.length === 0 분기가 있다 — 결함이 재발했다"
  );
});

for (const [label, src] of [
  ["MonthView.tsx", monthViewSrc],
  ["WeekView.tsx", weekViewSrc],
  ["DayView.tsx", dayViewSrc],
  ["TimeGrid.tsx", timeGridSrc],
]) {
  check(`${label}: EmptyState로 격자를 대체하는 코드가 없다`, () => {
    assert.ok(!/EmptyState/.test(src), `${label}이 EmptyState를 참조한다 — 격자 대체 회귀 의심`);
  });
  check(`${label}: 이벤트 0건을 이유로 격자 자체를 반환 중단하는 이른 return이 없다`, () => {
    // "길이가 0이면 (grid가 아닌) 다른 걸 return" 패턴 전반을 잡는다.
    // events / dayEvents / sorted 등 흔한 변수명 + .length===0 뒤에 EmptyState류 반환이 오는지.
    const badPattern = /\.length\s*===\s*0\)\s*\{\s*return\s*\(?\s*<(EmptyState|ForbiddenState|ErrorState)/;
    assert.ok(!badPattern.test(src), `${label}에 "0건이면 다른 컴포넌트로 완전히 대체" 패턴이 남아있다`);
  });
}

check("ListView.tsx: 날짜별 섹션이 없을 뿐 격자 컨테이너 자체는 유지된다(그리드 대체 EmptyState 없음)", () => {
  assert.ok(!/EmptyState/.test(listViewSrc), "ListView가 EmptyState를 참조한다");
});

/* ────────────────────────────────────────────────────────────
   2) 로직 검사 — 격자 크기는 이벤트 배열과 무관하다
   ──────────────────────────────────────────────────────────── */

check("monthGrid: 항상 6주×7일 = 42칸(이벤트 유무와 무관, 월마다 실제 주 수와 무관)", () => {
  // 2026-02(28일, 일요일 시작)처럼 짧은 달과 2026-08(31일)처럼 긴 달 둘 다 42칸이어야 한다.
  for (const [y, m] of [[2026, 2], [2026, 8], [2026, 9]]) {
    const flat = monthGrid(y, m, "Asia/Seoul").flat();
    assert.equal(flat.length, 42, `${y}-${m}: ${flat.length}칸(42가 아님)`);
    assert.equal(new Set(flat).size, 42, `${y}-${m}: 날짜 키 중복 발생`);
  }
});

check("computeRange('month'): days 배열 길이는 이벤트 데이터 유무와 무관하게 42", () => {
  const range = computeRange("month", "2026-09-12", "Asia/Seoul");
  assert.equal(range.days.length, 42);
});

check("computeRange('week'): days 배열 길이는 항상 7", () => {
  const range = computeRange("week", "2026-09-12", "Asia/Seoul");
  assert.equal(range.days.length, 7);
});

check("computeRange('day'): days 배열 길이는 항상 1(선택한 날짜 그대로)", () => {
  const range = computeRange("day", "2026-09-12", "Asia/Seoul");
  assert.deepEqual(range.days, ["2026-09-12"]);
});

check("groupEventsByDay([]): 빈 이벤트에서도 정상적으로 빈 Map을 돌려준다(격자 순회는 days가 결정)", () => {
  const map = groupEventsByDay([], "Asia/Seoul");
  assert.equal(map.size, 0);
  // MonthView/TimeGrid는 항상 `byDay.get(dateKey) ?? []`로 읽으므로 0건이어도 예외 없이 빈 배열이 나와야 한다.
  assert.deepEqual(map.get("2026-09-12") ?? [], []);
});

check("월 격자 42칸 × 이벤트 0건 시뮬레이션: 모든 칸이 빈 배열을 받고, 칸 수 자체는 줄지 않는다", () => {
  const days = monthGrid(2026, 9, "Asia/Seoul").flat();
  const byDay = groupEventsByDay([], "Asia/Seoul");
  const rendered = days.map((d) => ({ dateKey: d, events: byDay.get(d) ?? [] }));
  assert.equal(rendered.length, 42, "이벤트가 없다고 렌더링할 칸 수가 줄면 안 된다");
  assert.ok(
    rendered.every((c) => Array.isArray(c.events) && c.events.length === 0),
    "빈 이벤트인데 칸에 예외적인 값이 들어갔다"
  );
});

console.log(`\n${pass} passed${process.exitCode ? ", FAILURES ABOVE" : ""}`);
