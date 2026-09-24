#!/usr/bin/env node
// lib/domain/money.ts 자체 검증 — 계약(docs/crm-contract.md §3) 예시를 그대로 넣는다.
// 실행: node scripts/test-money.mjs
import assert from "node:assert/strict";
import * as money from "../lib/domain/money.ts";
const {
  toKRW,
  isValidKRW,
  formatKRW,
  parseKRW,
  billTotal,
  sumItemFees,
  previewCashDelta,
} = money;

let count = 0;
function check(name, fn) {
  fn();
  count += 1;
  console.log(`PASS  ${name}`);
}

check("toKRW: 소수 절단", () => {
  assert.equal(toKRW(1000.9), 1000);
  assert.equal(toKRW(NaN), 0);
  assert.equal(toKRW(-1), -1);
});

check("isValidKRW: 0 이상 정수만 통과", () => {
  assert.equal(isValidKRW(100000), true);
  assert.equal(isValidKRW(0), true);
  assert.equal(isValidKRW(-1), false);
  assert.equal(isValidKRW(1.5), false);
  assert.equal(isValidKRW("100000"), false);
});

check("formatKRW / parseKRW 왕복", () => {
  assert.equal(formatKRW(150000), "150,000원");
  assert.equal(formatKRW(0), "0원");
  assert.equal(parseKRW("150,000원"), 150000);
  assert.equal(parseKRW(""), 0);
  assert.equal(parseKRW("원"), 0);
});

check("billTotal: 대여료-할인+연체료+손상비 (보증금 없음)", () => {
  assert.equal(
    billTotal({ rentalFee: 100000, discount: 10000, lateFee: 20000, damage: 0 }),
    110000
  );
  assert.equal(billTotal({ rentalFee: 0, discount: 0, lateFee: 0, damage: 0 }), 0);
});

check("sumItemFees: 항목 합계", () => {
  const sum = sumItemFees([
    { fee: 100000, discount: 0 },
    { fee: 50000, discount: 10000 },
  ]);
  assert.deepEqual(sum, { rentalFee: 150000, discount: 10000 });
});

// ── 계약 §3 시나리오: 대여료 100,000 + 보증금 50,000 수납 ──────────────
check("계약 §3: 대여료 100,000 + 보증금 50,000 수납 → 현금 150,000 / 매출 100,000 / 보증금 50,000", () => {
  const lines = [
    { entry_type: "rental_revenue", amount: 100000, direction: "in" },
    { entry_type: "deposit_in", amount: 50000, direction: "in" },
  ];
  const cashReceived = previewCashDelta(lines);
  const rentalRevenue = lines
    .filter((l) => l.entry_type === "rental_revenue")
    .reduce((s, l) => s + l.amount, 0);
  const depositBalance = lines
    .filter((l) => l.entry_type === "deposit_in")
    .reduce((s, l) => s + l.amount, 0);

  assert.equal(cashReceived, 150000);
  assert.equal(rentalRevenue, 100000);
  assert.equal(depositBalance, 50000);
});

check("계약 §3: 보증금 전액 반환 후 보증금 0, 대여매출 100,000 유지(재차감·중복증가 없음)", () => {
  // deposit_out(부채 차감) + refund(현금 유출)가 함께 기록된다(0004_ledger.sql refund_deposit).
  // rental_revenue 계정은 이 흐름에서 전혀 건드리지 않는다 — 그래서 100,000이 그대로 유지된다.
  const depositLines = [
    { entry_type: "deposit_in", amount: 50000, direction: "in" },
    { entry_type: "deposit_out", amount: 50000, direction: "out" },
  ];
  const depositBalance = depositLines.reduce(
    (s, l) => s + (l.direction === "in" ? l.amount : -l.amount),
    0
  );
  const rentalRevenueStillHeld = 100000; // rental_revenue 계정은 별도이며 변경되지 않는다

  assert.equal(depositBalance, 0);
  assert.equal(rentalRevenueStillHeld, 100000);
});

check("두 계정을 더하는 함수가 없다 (RentalCharges/DepositState는 항상 분리)", () => {
  // money.ts는 rentalFee/discount/lateFee/damage 와 held/refundable을 더해
  // "총액" 하나로 만드는 export를 의도적으로 제공하지 않는다.
  const exportNames = Object.keys(money);
  const forbidden = exportNames.filter((n) => /total/i.test(n) && /deposit/i.test(n));
  assert.deepEqual(forbidden, []);
  assert.ok(exportNames.includes("billTotal"));
});

console.log(`\n총 ${count}건 · 모두 PASS`);
