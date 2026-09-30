"use client";

/** /ui-preview/tenant 의 모의 서버 함수와 가짜 데이터. 화면 확인 전용 — 실제 페이지는 이 파일을 쓰지 않는다. */
import * as React from "react";
import { TenantPortal, type TenantApi } from "@/components/tenant-portal/TenantPortal";
import { TenantPortalCard, type PortalAdminApi } from "@/components/building-ops/TenantPortalCard";
import type { PortalBillDetail, PortalBillSummary, PortalSummary } from "@/lib/domain/building-portal";

const wait = <T,>(v: T, ms = 350) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const BUILDING = { name: "누리타워", kind: "commercial", address: "서울 중구 세종대로 1", office_name: "누리타워 관리사무소", office_phone: "02-1234-5678", office_hours: "평일 9시~18시", bank_name: "국민은행", bank_account: "123456-01-234567", bank_holder: "누리타워관리단" };
const periods = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(2026, 8 - i, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; });
const BILLS: PortalBillSummary[] = periods.flatMap((p, i) => {
  const cur = 412_300 - i * 7_150 + (i % 3) * 12_400;
  const regular: PortalBillSummary = { id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, period: p, bill_kind: "regular", revision: 1, current_charge: cur, prior_unpaid: i === 0 ? 198_000 : 0, late_fee: i === 0 ? 3_960 : 0, credit: 0, amount_due: cur + (i === 0 ? 201_960 : 0), due_date: `${p}-25`, remaining: i === 0 ? cur + 201_960 : i === 1 ? 198_000 : 0, paid: i > 1 };
  if (i !== 1) return [regular];
  return [regular, { ...regular, id: "00000000-0000-4000-8000-100000000001", bill_kind: "correction", revision: 2, current_charge: -12_000, prior_unpaid: 0, late_fee: 0, amount_due: -12_000, remaining: 0, paid: true }];
});
const SUMMARY: PortalSummary = {
  building: BUILDING, unit: { dong: null, unit_no: "301" }, payer_name: "(주)누리상사", expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  outstanding: BILLS[0].remaining!, next_due_date: "2026-08-25", credit_balance: 20_000, bills: BILLS,
  disputes: [
    { id: "d1", receipt_no: "7F3A9C21", bill_id: BILLS[0].id, period: periods[0], kind: "dispute", status: "open", note: "이번 달 전기요금이 지난달보다 많이 나왔습니다. 계량기 숫자를 다시 확인해 주세요.", charge_type_id: "c-elec", resolution: null, resolved_at: null, created_at: new Date(Date.now() - 3600_000).toISOString() },
    { id: "d2", receipt_no: "1B08E4D7", bill_id: BILLS[1].id, period: periods[1], kind: "info_request", status: "resolved", note: "14개 항목별 금액을 알고 싶습니다.", charge_type_id: null, resolution: "명세서 '관리비 14개 항목' 칸에 금액을 넣어 다시 드렸습니다. 이 화면에서도 보실 수 있습니다.", resolved_at: new Date(Date.now() - 86400_000 * 20).toISOString(), created_at: new Date(Date.now() - 86400_000 * 25).toISOString() },
  ],
  dispute_quota: { limit: 3, used_today: 1 }, features: { late_fee: true, statement_chart: true, statement_notice: true, statement_stub: false },
};
const L = (id: string, cat: PortalBillDetail["lines"][number]["std_category"], name: string, amount: number, basis: Record<string, unknown>, meter: string | null = null) =>
  ({ charge_type_id: id, std_category: cat, name, meter_kind: meter, tax_treatment: "taxable" as const, supply: Math.round(amount / 1.1), vat: amount - Math.round(amount / 1.1), exempt: 0, amount, basis });
function detail(id: string): PortalBillDetail {
  const b = BILLS.find((x) => x.id === id) ?? BILLS[0];
  const lines = [
    L("c-gen", "general", "일반관리비", 98_000, { method: "area", numerator: 33.72, denominator: 1204.5 }),
    L("c-clean", "cleaning", "청소비", 41_200, { method: "area", numerator: 33.72, denominator: 1204.5 }),
    L("c-sec", "security", "경비비", 52_800, { method: "area", numerator: 33.72, denominator: 1204.5 }),
    L("c-elev", "elevator", "승강기유지비", 12_400, { method: "equal" }),
    L("c-elec", "electric", "전기료", 118_700, { method: "meter_usage", basis: 812, rate: 146.2 }, "electric"),
    L("c-water", "water", "수도료", 23_100, { method: "meter_usage", basis: 21, rate: 1100 }, "water"),
    L("c-ins", "insurance", "건물 보험료", 8_900, { method: "area", numerator: 33.72, denominator: 1204.5 }),
    L("c-repair", "repair", "수선유지비", 57_200, { method: "fixed", rate: 57_200 }),
  ];
  return {
    bill: { ...b, supply: Math.round(b.current_charge / 1.1), vat: b.current_charge - Math.round(b.current_charge / 1.1), exempt: 0 },
    lines, prev_lines: { "c-gen": 98_000, "c-clean": 39_800, "c-sec": 52_800, "c-elev": 12_400, "c-elec": 96_300, "c-water": 24_000, "c-ins": 8_900 }, meters: [
      { kind: "electric", serial: "E-301", unit_label: "kWh", multiplier: 1, prev: 48_210, curr: 49_022, usage: 812, reason: null },
      { kind: "water", serial: null, unit_label: "㎥", multiplier: 1, prev: 1_204, curr: 1_225, usage: 21, reason: null },
    ],
    period: { usage_from: `${b.period}-01`, usage_to: `${b.period}-30`, notice: "10월 12일(월) 오전 9시~12시 승강기 정기 점검이 있습니다." },
    history: null, building: BUILDING, payer_name: SUMMARY.payer_name, features: SUMMARY.features,
    unit: { dong: null, unit_no: "301", floor: "3", use_kind: "retail", area_exclusive: 33.72, area_common: 12.1 },
    supplier: { name: "누리타워관리단", biz_reg_no: "123-45-67890", ceo_name: "김관리", address: BUILDING.address },
    prior: b.prior_unpaid ? [{ period: periods[1], kind: "bill", due_date: `${periods[1]}-25`, amount: 198_000, paid: 0, credit_applied: 0 }] : [],
    late_items: null,
  };
}

function tenantApi(mode: string): TenantApi {
  let logged = mode === "home";
  const offFail = { ok: false as const, hint: "portal_off" as const, message: "이 건물은 지금 입주자 조회를 쓰지 않습니다. 관리사무소로 문의해 주세요." };
  const linkFail = { ok: false as const, hint: "link_invalid" as const, message: "QR 주소가 올바르지 않거나 바뀌었습니다. 관리사무소에 새 QR 을 요청해 주세요." };
  const noSession = { ok: false as const, hint: "session_invalid" as const, message: "조회 시간이 지났습니다. 호실과 접속코드를 다시 입력해 주세요." };
  return {
    getPortalBuilding: async () => wait(mode === "off" ? offFail : mode === "link" ? linkFail : { ok: true as const, data: { building_name: BUILDING.name, office_name: BUILDING.office_name, office_phone: BUILDING.office_phone, office_hours: BUILDING.office_hours, has_dong: false } }),
    portalLogin: async ({ code }) => {
      const c = code.replace(/-/g, "").toUpperCase();
      if (c === "WRONG000") return wait({ ok: false as const, hint: "invalid_credentials" as const, message: "호실 또는 접속코드가 맞지 않습니다.", remainingAttempts: 3 });
      if (c === "LOCK0000") return wait({ ok: false as const, hint: "locked" as const, message: "여러 번 틀려 잠시 잠겼습니다.", retryAfterSec: 125 });
      logged = true;
      return wait({ ok: true as const, data: { expiresAt: SUMMARY.expires_at } });
    },
    getPortalSummary: async () => wait(logged ? { ok: true as const, data: SUMMARY } : noSession),
    getPortalBill: async (id) => wait(logged ? { ok: true as const, data: detail(id) } : noSession, 500),
    submitPortalDispute: async () => wait({ ok: true as const, data: { id: "d3", receiptNo: "C42E91A0", remainingToday: 1 } }, 600),
    portalLogout: async () => { logged = false; return wait({ ok: true as const, data: undefined }); },
  };
}

const UNITS = ["101", "102", "201", "202", "301", "302"].map((u, i) => ({ unit_id: `u-${u}`, dong: null, unit_no: u, code_issued_at: i < 3 ? new Date(Date.now() - 86400_000 * 9).toISOString() : null, payer_name: i < 3 ? ["(주)누리상사", "김가게", "박상점"][i] : null, last_login_at: i === 0 ? new Date(Date.now() - 3600_000).toISOString() : null, lock_wait_sec: i === 2 ? 540 : 0, contract_id: i < 3 ? `k-${u}` : null, active_codes: i === 0 ? 2 : i < 3 ? 1 : 0, fails_15m: i === 1 ? 3 : i === 2 ? 50 : 0 }));
const adminApi: PortalAdminApi = {
  getPortalStatus: async () => wait({ ok: true as const, data: { feature: "on" as const, link: { link_id: "l1", created_at: new Date(Date.now() - 86400_000 * 9).toISOString() }, units: UNITS } }),
  listPortalViews: async () => wait({ ok: true as const, data: [
    { id: 3, unit_id: "u-101", party_id: null, action: "dispute" as const, bill_id: null, created_at: new Date(Date.now() - 3000_000).toISOString() },
    { id: 2, unit_id: "u-101", party_id: null, action: "bill" as const, bill_id: null, created_at: new Date(Date.now() - 3300_000).toISOString() },
    { id: 1, unit_id: "u-101", party_id: null, action: "login" as const, bill_id: null, created_at: new Date(Date.now() - 3600_000).toISOString() },
  ] }),
  issuePortalLink: async () => wait({ ok: true as const, data: { linkId: "l2", token: "mock-token-8f2c4e1a9b7d6c5e4f3a2b1c0d9e8f7a", revokedPrevious: 1 } }),
  revokePortalLink: async () => wait({ ok: true as const, data: { revoked: 1 } }),
  issuePortalCodes: async (_b, _bid, ids, cids) => wait(cids ? { ok: true as const, data: { issued: [{ unit_id: "u-302", dong: null, unit_no: "302", payer_name: "최입주(예정)", code: "T9QW4KZP", contract_id: cids[0] }], skipped: [] } } : { ok: true as const, data: {
    issued: UNITS.filter((u) => !ids || ids.includes(u.unit_id)).slice(0, 3).map((u, i) => ({ unit_id: u.unit_id, dong: null, unit_no: u.unit_no, payer_name: ["(주)누리상사", "김가게", "박상점"][i] ?? null, code: ["K7PM2QXA", "R4TW9HZC", "M3NB8VYE"][i] })),
    skipped: [{ unit_id: "u-302", dong: null, unit_no: "302", reason: "upcoming_contract" as const, contract_id: "k-302-next", payer_name: "최입주" }, { unit_id: "u-401", dong: null, unit_no: "401", reason: "no_active_contract" as const }],
  } }),
  revokePortalCode: async () => wait({ ok: true as const, data: { revoked: 1 } }),
};

export function TenantPreview({ mode }: { mode: string }) {
  const api = React.useMemo(() => tenantApi(mode), [mode]);
  if (mode === "admin" || mode === "admin-off") {
    return (
      <div data-accent="teal" className="min-h-dvh bg-bg p-4 sm:p-8">
        <div className="mx-auto max-w-[1080px]">
          <TenantPortalCard businessId="biz" building={{ id: "b1", name: BUILDING.name, office_name: BUILDING.office_name, office_phone: BUILDING.office_phone, office_hours: BUILDING.office_hours }}
            feature={mode === "admin-off" ? "off" : "on"} canWrite canBilling tz="Asia/Seoul" unitNames={Object.fromEntries(UNITS.map((u) => [u.unit_id, u.unit_no]))} api={adminApi} />
        </div>
      </div>
    );
  }
  return <TenantPortal token="preview" api={api} />;
}
