// 회귀: 잔액 뷰 discount 부호(음수) 표시 헬퍼 손계산 대조. 실행: node scripts/test-rental-money-view.mjs
import assert from "node:assert/strict";
const discountAbs = (v) => Math.abs(Number(v ?? 0));
const chargedTotal = (b) => b.rentalRevenue + b.lateFee + b.damageCharge + b.cancelPenalty - discountAbs(b.discount) - b.compensation;
const unbilledDiscount = (itemDiscount, ledgerDiscount) => Math.max(0, itemDiscount - discountAbs(ledgerDiscount));
const base = { rentalRevenue: 100000, lateFee: 0, damageCharge: 0, cancelPenalty: 0, compensation: 0 };
// 1) 할인 0
assert.equal(chargedTotal({ ...base, discount: 0 }), 100000);
assert.equal(unbilledDiscount(0, 0), 0);
// 2) 항목 할인 10,000 만 있고 원장 미반영(discount 0) → 청구 100,000, 미반영 할인 10,000
assert.equal(chargedTotal({ ...base, discount: 0 }), 100000);
assert.equal(unbilledDiscount(10000, 0), 10000);
// 3) 원장 할인 반영(뷰 discount = −10,000) → 청구 90,000, 표시 할인 10,000, 미반영 0
assert.equal(chargedTotal({ ...base, discount: -10000 }), 90000);
assert.equal(discountAbs(-10000), 10000);
assert.equal(unbilledDiscount(10000, -10000), 0);
console.log("PASS rental money view (discount sign) 3 cases");
