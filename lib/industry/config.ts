/**
 * 업종 설정 — 업종별 활성 기능의 단일 출처.
 *
 * 프롬프트 §6: "업종별 활성 기능은 작은 명시적 설정으로 관리한다."
 * 화면/메뉴/캘린더 종류는 전부 여기서 읽는다. 거대한 조건문이나
 * 모든 업종용 범용 폼으로 억지 통합하지 않는다.
 *
 * 주의: 업종은 **권한의 근거가 아니다**(docs/crm-contract.md §1).
 * 권한은 서버가 memberships에서 계산한 capability로만 판정한다.
 */

export const INDUSTRIES = ["factory", "rental", "unmanned", "salon", "academy"] as const;
export type Industry = (typeof INDUSTRIES)[number];

/** 사업장 설정으로 덮어쓸 수 있는 기능 스위치. 여기 값은 업종 기본값이다. */
export interface IndustryFeatures {
  /** 직원 출퇴근/근태. 공장은 사용자 필수 요구로 항상 false(생산 작업시간과 혼동 금지). */
  attendance: boolean;
  /** 근태를 사업장 설정에서 켤 수 있는가. 공장은 켤 수조차 없다. */
  attendanceConfigurable: boolean;
  /** 기간 재고(미래 예약이 재고를 점유) — 렌탈만. */
  periodInventory: boolean;
  /** 수량 재고(입출고·실사·조정). */
  stockInventory: boolean;
  /** 개체 단위 관리(고유코드·QR·상태·이력). */
  unitTracking: boolean;
  /** 보증금 회계(매출과 분리된 부채 계정). */
  deposit: boolean;
  /** 자원 예약 충돌 검사 대상. */
  resourceBooking: "none" | "unit" | "staff+seat" | "teacher+room";
  /** 카메라 스캔 사용처. */
  scan: boolean;
  /** 학생 출결(직원 근태와 데이터·권한·화면이 분리된 별개 개념). */
  studentAttendance: boolean;
}

export interface IndustryNav {
  key: string;
  /** 업종 작업공간 기준 상대 경로. 최종 URL = /w/{businessId}/{path} */
  path: string;
  label: string;
  /** 이 메뉴를 보려면 필요한 capability. 서버도 같은 키로 강제한다. */
  cap: string;
}

export interface IndustryDef {
  key: Industry;
  name: string;
  /** 로그인 화면 업종 선택에 쓰는 짧은 업무 설명. */
  desc: string;
  /** @tabler/icons-react 아이콘 이름. */
  icon: string;
  features: IndustryFeatures;
  nav: IndustryNav[];
  /** 이 업종이 캘린더에 만드는 일정 종류. calendar_events.kind 와 1:1. */
  eventKinds: { kind: string; label: string }[];
}

const base = (o: Partial<IndustryFeatures>): IndustryFeatures => ({
  attendance: false,
  attendanceConfigurable: true,
  periodInventory: false,
  stockInventory: false,
  unitTracking: false,
  deposit: false,
  resourceBooking: "none",
  scan: false,
  studentAttendance: false,
  ...o,
});

export const INDUSTRY_DEFS: Record<Industry, IndustryDef> = {
  factory: {
    key: "factory",
    name: "의류공장",
    desc: "수주·작업지시·가봉·공정·출고까지 맞춤 생산 관리",
    icon: "IconNeedleThread",
    // 사용자 필수 요구: 공장에는 근태 기능과 메뉴를 넣지 않는다.
    // 공정별 예정/실제 작업시간은 근태가 아니라 생산 데이터다.
    features: base({
      attendance: false,
      attendanceConfigurable: false,
      stockInventory: true,
      scan: true,
    }),
    nav: [
      { key: "dash", path: "", label: "대시보드", cap: "view" },
      { key: "customers", path: "customers", label: "고객", cap: "view" },
      { key: "orders", path: "orders", label: "주문·작업지시", cap: "view" },
      { key: "production", path: "production", label: "공정", cap: "view" },
      { key: "calendar", path: "calendar", label: "캘린더", cap: "view" },
      { key: "materials", path: "materials", label: "자재 재고", cap: "view" },
      // features.scan 이 true 인데 메뉴가 없으면 딥링크로만 닿는 유령 화면이 된다.
      { key: "scan", path: "scan", label: "스캔", cap: "write" },
      { key: "settlement", path: "settlement", label: "정산", cap: "revenue.read" },
      { key: "staff", path: "staff", label: "직원·권한", cap: "staff.manage" },
    ],
    eventKinds: [
      { kind: "factory.fitting", label: "가봉" },
      { kind: "factory.due", label: "납기" },
      { kind: "factory.process", label: "공정" },
      { kind: "factory.delivery", label: "출고" },
    ],
  },

  rental: {
    key: "rental",
    name: "의류렌탈",
    desc: "예약·개체 배정·출고/반납·세탁수선·보증금 정산",
    icon: "IconHanger",
    features: base({
      attendance: false, // 1인 운영이 많아 기본 꺼짐 — 사업장 설정으로 켤 수 있다
      attendanceConfigurable: true,
      periodInventory: true,
      stockInventory: true,
      unitTracking: true,
      deposit: true,
      resourceBooking: "unit",
      scan: true,
    }),
    nav: [
      { key: "dash", path: "", label: "오늘 현황", cap: "view" },
      { key: "reservations", path: "reservations", label: "예약", cap: "view" },
      { key: "calendar", path: "calendar", label: "캘린더", cap: "view" },
      { key: "customers", path: "customers", label: "고객", cap: "view" },
      { key: "catalog", path: "catalog", label: "상품·개체", cap: "view" },
      { key: "care", path: "care", label: "세탁·수선", cap: "view" },
      { key: "scan", path: "scan", label: "스캔", cap: "write" },
      { key: "settlement", path: "settlement", label: "정산", cap: "revenue.read" },
      { key: "staff", path: "staff", label: "직원·권한", cap: "staff.manage" },
    ],
    eventKinds: [
      { kind: "rental.fitting", label: "피팅" },
      { kind: "rental.checkout", label: "출고" },
      { kind: "rental.return", label: "반납" },
      { kind: "rental.care", label: "정비" },
    ],
  },

  unmanned: {
    key: "unmanned",
    name: "무인매장",
    desc: "바코드 상품·입고·실사·재고조정, 보충·청소·점검 일정",
    icon: "IconBuildingStore",
    features: base({
      attendance: false, // 기본 비활성 — 보충·청소 직원이 있으면 설정에서 켠다
      attendanceConfigurable: true,
      stockInventory: true,
      scan: true,
    }),
    nav: [
      { key: "dash", path: "", label: "대시보드", cap: "view" },
      { key: "products", path: "products", label: "상품·바코드", cap: "view" },
      { key: "stock", path: "stock", label: "재고·실사", cap: "view" },
      { key: "tasks", path: "tasks", label: "점검·보충", cap: "view" },
      { key: "calendar", path: "calendar", label: "캘린더", cap: "view" },
      // CP-219b: sales/page.tsx 는 view 로 열고 금액만 revenue.read 로 가린다(SalesBoard canReadRevenue). 메뉴가 더 엄격하면
      // "메뉴엔 없는데 URL 로는 열리는" 유령 화면이 된다 — 페이지가 권한의 기준이다.
      { key: "sales", path: "sales", label: "매출 기록", cap: "view" },
      // CP-230/236: 스캔은 담기·확정이 write 이고 view 사용자는 시도조차 못 한다(ScanWorkspace canWrite 가드) — 메뉴도 write.
      { key: "scan", path: "scan", label: "스캔", cap: "write" },
      { key: "staff", path: "staff", label: "직원·권한", cap: "staff.manage" },
    ],
    eventKinds: [
      { kind: "unmanned.restock", label: "보충" },
      { kind: "unmanned.clean", label: "청소" },
      { kind: "unmanned.check", label: "시설 점검" },
      { kind: "unmanned.expiry", label: "유통기한 점검" },
    ],
  },

  salon: {
    key: "salon",
    name: "미용실",
    desc: "시술 예약·담당 직원/좌석 배정·수납·소모품 재고",
    icon: "IconScissors",
    features: base({
      attendance: true, // 직원 운영이 전제
      attendanceConfigurable: true,
      stockInventory: true,
      resourceBooking: "staff+seat",
      scan: false,
    }),
    nav: [
      { key: "dash", path: "", label: "오늘 예약", cap: "view" },
      { key: "calendar", path: "calendar", label: "예약 캘린더", cap: "view" },
      { key: "customers", path: "customers", label: "고객", cap: "view" },
      { key: "services", path: "services", label: "시술·가격", cap: "view" },
      { key: "staff-shift", path: "staff-shift", label: "근무표·출퇴근", cap: "attendance.self" },
      { key: "stock", path: "stock", label: "상품·소모품", cap: "view" },
      { key: "settlement", path: "settlement", label: "수납·정산", cap: "revenue.read" },
      { key: "staff", path: "staff", label: "직원·권한", cap: "staff.manage" },
    ],
    eventKinds: [
      { kind: "salon.booking", label: "예약" },
      { kind: "salon.off", label: "휴무·휴게" },
    ],
  },

  academy: {
    key: "academy",
    name: "학원",
    desc: "반·수강등록·시간표·보강·학생 출결·수강료 미납",
    icon: "IconSchool",
    features: base({
      attendance: true, // 강사·직원 근태
      attendanceConfigurable: true,
      stockInventory: true, // 교재·교구
      resourceBooking: "teacher+room",
      scan: false,
      studentAttendance: true, // 직원 근태와 데이터·권한·화면이 분리된 별개 개념
    }),
    nav: [
      { key: "dash", path: "", label: "대시보드", cap: "view" },
      { key: "students", path: "students", label: "학생·보호자", cap: "view" },
      { key: "consultations", path: "consultations", label: "입학 상담", cap: "view" },
      { key: "classes", path: "classes", label: "반·수강등록", cap: "view" },
      { key: "timetable", path: "timetable", label: "시간표", cap: "view" },
      { key: "attendance", path: "attendance", label: "학생 출결", cap: "view" },
      { key: "staff-shift", path: "staff-shift", label: "강사 근태", cap: "attendance.self" },
      { key: "materials", path: "materials", label: "교재·교구", cap: "view" },
      { key: "tuition", path: "tuition", label: "수강료·미납", cap: "revenue.read" },
      { key: "staff", path: "staff", label: "직원·권한", cap: "staff.manage" },
    ],
    eventKinds: [
      { kind: "academy.class", label: "수업" },
      { kind: "academy.makeup", label: "보강" },
      { kind: "academy.cancel", label: "휴강" },
    ],
  },
};

export const isIndustry = (v: unknown): v is Industry =>
  typeof v === "string" && (INDUSTRIES as readonly string[]).includes(v);

/**
 * 사업장 설정으로 업종 기본값을 덮어쓴 최종 기능 스위치.
 * 공장 근태는 사용자 필수 요구이므로 설정으로도 켤 수 없다.
 */
export function resolveFeatures(
  industry: Industry,
  settings: Record<string, unknown> | null | undefined
): IndustryFeatures {
  const def = INDUSTRY_DEFS[industry].features;
  const override = ((settings?.features ?? {}) as Partial<IndustryFeatures>) || {};
  const merged: IndustryFeatures = { ...def, ...override };
  if (!def.attendanceConfigurable) {
    merged.attendance = def.attendance;
    merged.attendanceConfigurable = false;
  }
  return merged;
}
