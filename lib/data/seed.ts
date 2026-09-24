/**
 * NURI CRM 시드 데이터.
 * 기존 NURI-CRM.html 의 CS, STATE.businesses, STATE.fabrics, STYLE_CATALOG,
 * OD (캘린더 이벤트), FACTORY_EXTRA, VENDOR_EXTRA 를 모두 TypeScript 안전형으로 옮긴 것.
 *
 * Phase 1.3 의 Zustand 스토어는 이 파일을 초기 상태로 사용한다.
 * Phase 2 백엔드 연동 시 이 모듈은 lib/api/mock 으로 이동될 수 있다.
 */
import type { Customer } from "@/types/customer";
import type { Business, FactoryExtra, VendorExtra } from "@/types/business";
import type { Fabric } from "@/types/fabric";
import type { Style } from "@/types/style";

/* ──────────────────────────────────────────────────────────────
   업체 10곳 (소매점 3 / 공장 3 / 원단매장 4)
   ────────────────────────────────────────────────────────────── */

export const SEED_BUSINESSES: Business[] = [
  { id: "BIZ-001", name: "성동패션",   type: "retailer",     approved: true  },
  { id: "BIZ-002", name: "강남셀렉트", type: "retailer",     approved: true  },
  { id: "BIZ-003", name: "홍대스타일", type: "retailer",     approved: false },
  { id: "BIZ-004", name: "성동봉제",   type: "factory",      approved: true  },
  { id: "BIZ-005", name: "을지봉제",   type: "factory",      approved: true  },
  { id: "BIZ-006", name: "마포봉제",   type: "factory",      approved: true  },
  { id: "BIZ-007", name: "한성직물",   type: "fabric_store", approved: true  },
  { id: "BIZ-008", name: "대성원단",   type: "fabric_store", approved: true  },
  { id: "BIZ-009", name: "명품원단",   type: "fabric_store", approved: true  },
  { id: "BIZ-010", name: "자연직물",   type: "fabric_store", approved: true  },
];

export const SEED_FACTORY_EXTRA: Record<string, FactoryExtra> = {
  "BIZ-004": { capa: "월 40벌", items: "수트·재킷·팬츠" },
  "BIZ-005": { capa: "월 25벌", items: "여성복·재킷" },
  "BIZ-006": { capa: "월 55벌", items: "수트·코트·조끼" },
  "BIZ-007": { capa: "—",       items: "울·캐시미어 원단" },
  "BIZ-008": { capa: "—",       items: "캐시미어·고급 원단" },
  "BIZ-009": { capa: "—",       items: "폴리·혼방 원단" },
  "BIZ-010": { capa: "—",       items: "린넨·자연 소재" },
};

export const SEED_VENDOR_EXTRA: Record<string, VendorExtra> = {
  "BIZ-007": { phone: "02-722-3344", addr: "서울 종로구 종로 12길",   rep: "박상민", since: "2018.03", ytd: "₩45,200,000" },
  "BIZ-008": { phone: "02-555-8899", addr: "서울 강남구 논현로 188",  rep: "이정아", since: "2019.07", ytd: "₩68,500,000" },
  "BIZ-009": { phone: "02-333-1212", addr: "서울 동대문구 청계천로",  rep: "김태형", since: "2020.11", ytd: "₩22,800,000" },
  "BIZ-010": { phone: "02-988-7766", addr: "경기 파주시 한빛로 30",  rep: "최영진", since: "2021.05", ytd: "₩31,600,000" },
};

/* ──────────────────────────────────────────────────────────────
   원단 재고 7품목
   ────────────────────────────────────────────────────────────── */

export const SEED_FABRICS: Fabric[] = [
  { id: "FAB-001", name: "울 100% 네이비",       businessId: "BIZ-007", qty: 28, price: 45000, color: "네이비", status: "여유" },
  { id: "FAB-002", name: "캐시미어 혼방 그레이", businessId: "BIZ-008", qty: 15, price: 85000, color: "그레이", status: "여유" },
  { id: "FAB-003", name: "울 혼방 차콜",         businessId: "BIZ-007", qty:  3, price: 38000, color: "차콜",   status: "부족" },
  { id: "FAB-004", name: "폴리 혼방 블랙",       businessId: "BIZ-009", qty: 42, price: 22000, color: "블랙",   status: "여유" },
  { id: "FAB-005", name: "울 100% 버건디",       businessId: "BIZ-008", qty:  5, price: 48000, color: "버건디", status: "부족" },
  { id: "FAB-006", name: "린넨 혼방 베이지",     businessId: "BIZ-010", qty: 20, price: 32000, color: "베이지", status: "여유" },
  { id: "FAB-007", name: "트위드 혼방",          businessId: "BIZ-007", qty:  0, price: 65000, color: "멀티",   status: "매진" },
];

/* ──────────────────────────────────────────────────────────────
   스타일북 8종
   ────────────────────────────────────────────────────────────── */

export const SEED_STYLES: Style[] = [
  { id: "STY-001", name: "싱글 2버튼 수트",     cat: "수트", fabric_m: 3.2, base: 500000, desc: "클래식한 싱글 브레스티드 재킷과 매칭 팬츠. 비즈니스·포멀 행사에 최적.",         tags: ["클래식", "포멀", "비즈니스"] },
  { id: "STY-002", name: "더블 브레스티드 수트", cat: "수트", fabric_m: 3.5, base: 580000, desc: "오버랩 더블 브레스티드 스타일. 강렬한 인상을 원할 때 추천.",                tags: ["빈티지", "포멀", "시그니처"] },
  { id: "STY-003", name: "쓰리피스 수트",       cat: "수트", fabric_m: 4.0, base: 650000, desc: "재킷·팬츠·조끼 풀세트. 웨딩·특별 행사용 프리미엄 구성.",                  tags: ["프리미엄", "웨딩", "풀세트"] },
  { id: "STY-004", name: "테일러드 재킷",       cat: "재킷", fabric_m: 1.8, base: 350000, desc: "팬츠 없이 단품 재킷. 캐주얼 수트·별도 팬츠와 자유롭게 매칭.",              tags: ["캐주얼", "비즈니스", "단품"] },
  { id: "STY-005", name: "클래식 트라우저",     cat: "팬츠", fabric_m: 1.4, base: 150000, desc: "기존 재킷과 자유롭게 코디 가능한 클래식 테일러드 팬츠.",                  tags: ["클래식", "단품", "활용도높음"] },
  { id: "STY-006", name: "오버코트",            cat: "코트", fabric_m: 4.5, base: 680000, desc: "울 혼방 원단으로 보온성과 격식을 동시에 갖춘 시즌 코트.",                  tags: ["겨울", "포멀", "프리미엄"] },
  { id: "STY-007", name: "웨이스트코트 (조끼)", cat: "조끼", fabric_m: 0.9, base: 120000, desc: "쓰리피스 추가 단품 또는 단독 착용 가능한 테일러드 조끼.",                  tags: ["단품", "포멀", "추가구성"] },
  { id: "STY-008", name: "여성 테일러드 수트",  cat: "수트", fabric_m: 2.8, base: 520000, desc: "여성 체형에 맞게 재단된 싱글 버튼 재킷 + 스커트/팬츠 세트.",              tags: ["여성", "포멀", "우아함"] },
];

/* ──────────────────────────────────────────────────────────────
   고객 13명 — 각자 1건 주문 보유 (전 상태 분포)
   ────────────────────────────────────────────────────────────── */

export const SEED_CUSTOMERS: Customer[] = [
  {
    name: "김민준", birth: "1988.03.15", phone: "010-2345-6789", gender: "남성",
    height: 178, weight: 72, neck: 39, shoulder: 46, chest: 96, belly: 85, waist: 80, hip: 94, thigh: 56, sleeve: 62, jacket: 74, tw: 82, tl: 108, rise: 28,
    fabric: "울 100% 네이비 스트라이프", lining: "빨강 실크", style: "싱글 2버튼 / 노치라펠", vent: "사이드벤트", pocket: "플랩 포켓",
    memo: "VIP 고객. 결혼식 예복 주문. 피팅 2회 예정.", reg: "26.01.12",
    orders: [{ no: "ORD-2026-001", item: "웨딩 수트 (상하의)", ord: "2026.05.01", del: "2026.05.20", fac: "성동봉제", st: "생산중", price: "1,850,000" }],
  },
  {
    name: "이서연", birth: "1993.07.22", phone: "010-9876-5432", gender: "여성",
    height: 163, weight: 52, neck: 34, shoulder: 38, chest: 84, belly: 72, waist: 65, hip: 88, thigh: 50, sleeve: 57, jacket: 64, tw: 66, tl: 98, rise: 26,
    fabric: "울 혼방 차콜", lining: "아이보리", style: "더블 4버튼 / 피크라펠", vent: "노벤트", pocket: "웰트 포켓",
    memo: "여성 맞춤 재킷. 촬영용.", reg: "26.02.03",
    orders: [{ no: "ORD-2026-002", item: "여성 테일러드 재킷", ord: "2026.04.25", del: "2026.05.12", fac: "을지봉제", st: "배송완료", price: "980,000" }],
  },
  {
    name: "박지훈", birth: "1985.11.05", phone: "010-5555-1234", gender: "남성",
    height: 182, weight: 85, neck: 42, shoulder: 48, chest: 104, belly: 96, waist: 88, hip: 100, thigh: 60, sleeve: 66, jacket: 78, tw: 90, tl: 112, rise: 30,
    fabric: "캐시미어 혼방 그레이", lining: "진청 실크", style: "싱글 2버튼 / 노치라펠", vent: "센터벤트", pocket: "플랩 포켓",
    memo: "비즈니스용. 추가 바지 1벌 포함.", reg: "26.03.17",
    orders: [{ no: "ORD-2026-003", item: "비즈니스 수트 + 추가 바지", ord: "2026.05.03", del: "2026.05.15", fac: "성동봉제", st: "배송완료", price: "2,200,000" }],
  },
  {
    name: "최수아", birth: "2000.01.18", phone: "010-7777-8888", gender: "여성",
    height: 165, weight: 50, neck: 33, shoulder: 37, chest: 82, belly: 70, waist: 62, hip: 86, thigh: 48, sleeve: 56, jacket: 62, tw: 64, tl: 95, rise: 25,
    fabric: "폴리 혼방 블랙", lining: "핑크 새틴", style: "싱글 1버튼 / 숄라펠", vent: "노벤트", pocket: "웰트 포켓",
    memo: "이브닝 드레스. 행사용.", reg: "26.04.01",
    orders: [{ no: "ORD-2026-004", item: "이브닝 재킷", ord: "2026.05.10", del: "2026.05.21", fac: "마포봉제", st: "재단중", price: "1,100,000" }],
  },
  {
    name: "홍길동", birth: "1980.06.10", phone: "010-4444-9999", gender: "남성",
    height: 170, weight: 68, neck: 38, shoulder: 43, chest: 92, belly: 88, waist: 84, hip: 92, thigh: 54, sleeve: 61, jacket: 72, tw: 86, tl: 104, rise: 27,
    fabric: "울 100% 네이비", lining: "베이지", style: "싱글 2버튼 / 노치라펠", vent: "사이드벤트", pocket: "플랩 포켓",
    memo: "클래식 수트. 첫 주문.", reg: "26.05.09", retailer: "",
    orders: [{ no: "ORD-2026-005", item: "클래식 수트", ord: "2026.05.09", del: "2026.05.28", fac: "성동봉제", st: "원단대기", price: "1,450,000" }],
  },
  {
    name: "정우성", birth: "1975.04.20", phone: "010-1234-5678", gender: "남성",
    height: 186, weight: 80, neck: 41, shoulder: 48, chest: 100, belly: 90, waist: 83, hip: 96, thigh: 58, sleeve: 65, jacket: 77, tw: 85, tl: 114, rise: 31,
    fabric: "캐시미어 혼방 그레이", lining: "진청 실크", style: "싱글 2버튼 / 노치라펠", vent: "센터벤트", pocket: "플랩 포켓",
    memo: "배우. 시상식 예복 주문.", reg: "26.01.20", retailer: "강남셀렉트",
    orders: [{ no: "ORD-2026-006", item: "시상식 싱글 수트", ord: "2026.04.20", del: "2026.05.05", fac: "성동봉제", st: "배송완료", price: "3,200,000" }],
  },
  {
    name: "김지수", birth: "1996.09.14", phone: "010-8888-2222", gender: "여성",
    height: 168, weight: 55, neck: 35, shoulder: 39, chest: 86, belly: 73, waist: 67, hip: 90, thigh: 52, sleeve: 58, jacket: 65, tw: 68, tl: 100, rise: 26,
    fabric: "린넨 혼방 베이지", lining: "흰색 실크", style: "싱글 1버튼 / 노치라펠", vent: "노벤트", pocket: "웰트 포켓",
    memo: "웨딩 하객 예복.", reg: "26.02.15", retailer: "성동패션",
    orders: [{ no: "ORD-2026-007", item: "하객 재킷 세트", ord: "2026.05.05", del: "2026.05.18", fac: "을지봉제", st: "봉제중", price: "1,250,000" }],
  },
  {
    name: "오현택", birth: "1982.12.03", phone: "010-3333-7777", gender: "남성",
    height: 175, weight: 74, neck: 40, shoulder: 45, chest: 98, belly: 92, waist: 86, hip: 97, thigh: 57, sleeve: 63, jacket: 75, tw: 88, tl: 107, rise: 29,
    fabric: "울 100% 버건디", lining: "베이지 실크", style: "더블 4버튼 / 피크라펠", vent: "사이드벤트", pocket: "플랩 포켓",
    memo: "회사 임원. 비즈니스 수트.", reg: "26.03.01", retailer: "강남셀렉트",
    orders: [{ no: "ORD-2026-008", item: "더블 브레스티드 수트", ord: "2026.05.06", del: "2026.05.22", fac: "마포봉제", st: "재단중", price: "2,050,000" }],
  },
  {
    name: "백수진", birth: "1991.03.27", phone: "010-6666-4444", gender: "여성",
    height: 162, weight: 48, neck: 33, shoulder: 37, chest: 81, belly: 69, waist: 61, hip: 85, thigh: 47, sleeve: 55, jacket: 62, tw: 63, tl: 94, rise: 25,
    fabric: "폴리 혼방 블랙", lining: "아이보리 실크", style: "싱글 2버튼 / 숄라펠", vent: "노벤트", pocket: "웰트 포켓",
    memo: "방송인. 홍보용 수트.", reg: "26.03.25", retailer: "",
    orders: [{ no: "ORD-2026-009", item: "여성 싱글 수트", ord: "2026.05.07", del: "2026.05.24", fac: "을지봉제", st: "원단대기", price: "1,380,000" }],
  },
  {
    name: "이동건", birth: "1979.07.11", phone: "010-2222-9999", gender: "남성",
    height: 180, weight: 77, neck: 40, shoulder: 46, chest: 99, belly: 91, waist: 85, hip: 98, thigh: 57, sleeve: 64, jacket: 76, tw: 87, tl: 110, rise: 29,
    fabric: "트위드 혼방", lining: "진청 실크", style: "쓰리피스 / 노치라펠", vent: "센터벤트", pocket: "플랩 포켓",
    memo: "3주년 기념 수트.", reg: "26.04.10", retailer: "성동패션",
    orders: [{ no: "ORD-2026-010", item: "쓰리피스 수트", ord: "2026.05.08", del: "2026.06.01", fac: "성동봉제", st: "주문접수", price: "2,800,000" }],
  },
  {
    name: "류하은", birth: "1998.11.22", phone: "010-5555-3333", gender: "여성",
    height: 167, weight: 53, neck: 34, shoulder: 38, chest: 83, belly: 71, waist: 64, hip: 87, thigh: 49, sleeve: 57, jacket: 63, tw: 65, tl: 97, rise: 25,
    fabric: "울 혼방 차콜", lining: "핑크 새틴", style: "싱글 2버튼 / 노치라펠", vent: "노벤트", pocket: "플랩 포켓",
    memo: "대학원 졸업식 예복.", reg: "26.04.18", retailer: "강남셀렉트",
    orders: [{ no: "ORD-2026-011", item: "졸업 수트", ord: "2026.05.09", del: "2026.05.25", fac: "마포봉제", st: "검수중", price: "1,100,000" }],
  },
  {
    name: "강민호", birth: "1987.08.30", phone: "010-9999-1111", gender: "남성",
    height: 177, weight: 76, neck: 40, shoulder: 45, chest: 97, belly: 89, waist: 82, hip: 95, thigh: 56, sleeve: 63, jacket: 74, tw: 84, tl: 108, rise: 28,
    fabric: "울 100% 네이비", lining: "빨강 실크", style: "싱글 2버튼 / 노치라펠", vent: "사이드벤트", pocket: "플랩 포켓",
    memo: "결혼 1주년 기념.", reg: "26.04.22", retailer: "성동패션",
    orders: [{ no: "ORD-2026-012", item: "기념 싱글 수트", ord: "2026.05.10", del: "2026.05.30", fac: "성동봉제", st: "배송예정", price: "1,700,000" }],
  },
  {
    name: "윤서희", birth: "1994.05.16", phone: "010-4444-6666", gender: "여성",
    height: 164, weight: 51, neck: 33, shoulder: 38, chest: 83, belly: 70, waist: 63, hip: 87, thigh: 49, sleeve: 56, jacket: 63, tw: 64, tl: 96, rise: 25,
    fabric: "캐시미어 혼방 그레이", lining: "아이보리 실크", style: "더블 2버튼 / 피크라펠", vent: "노벤트", pocket: "웰트 포켓",
    memo: "결혼식 본식 예복.", reg: "26.04.30", retailer: "강남셀렉트",
    orders: [{ no: "ORD-2026-013", item: "웨딩 재킷 세트", ord: "2026.05.11", del: "2026.06.05", fac: "을지봉제", st: "원단발주", price: "2,100,000" }],
  },
];

/* ──────────────────────────────────────────────────────────────
   캘린더 이벤트 (날짜별 그룹) — 대시보드 캘린더 점 표시용
   ────────────────────────────────────────────────────────────── */

export interface CalendarEvent {
  name: string;
  item: string;
  ord: string;
  del: string;
  type: string;
}

export const SEED_CALENDAR_EVENTS: Record<number, CalendarEvent[]> = {
  9: [
    { name: "김민준", item: "웨딩 수트",       ord: "05.01", del: "05.20", type: "생산중" },
    { name: "홍길동", item: "클래식 수트",     ord: "05.09", del: "05.28", type: "원단대기" },
    { name: "류하은", item: "졸업 수트",       ord: "05.09", del: "05.25", type: "검수중" },
  ],
  12: [
    { name: "이서연", item: "여성 테일러드 재킷", ord: "04.25", del: "05.12", type: "배송완료" },
  ],
  15: [
    { name: "박지훈", item: "비즈니스 수트",   ord: "05.03", del: "05.15", type: "배송완료" },
    { name: "오현택", item: "더블 브레스티드 수트", ord: "05.06", del: "05.22", type: "재단중" },
  ],
  21: [
    { name: "최수아", item: "이브닝 재킷",     ord: "05.10", del: "05.21", type: "재단중" },
    { name: "강민호", item: "기념 싱글 수트", ord: "05.10", del: "05.30", type: "배송예정" },
  ],
  28: [
    { name: "홍길동", item: "클래식 수트",     ord: "05.09", del: "05.28", type: "원단대기" },
    { name: "이동건", item: "쓰리피스 수트",   ord: "05.08", del: "06.01", type: "주문접수" },
  ],
};

/* ──────────────────────────────────────────────────────────────
   시드 데이터 일괄 export — 스토어 초기화 편의용
   ────────────────────────────────────────────────────────────── */

export const SEED = {
  businesses: SEED_BUSINESSES,
  factoryExtra: SEED_FACTORY_EXTRA,
  vendorExtra: SEED_VENDOR_EXTRA,
  fabrics: SEED_FABRICS,
  customers: SEED_CUSTOMERS,
  styles: SEED_STYLES,
  events: SEED_CALENDAR_EVENTS,
};
