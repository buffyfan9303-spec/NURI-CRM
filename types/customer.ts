import type { Order } from "./order";

/**
 * MTM 신체 치수 14항목 — 기존 CS[name] 의 치수 필드와 1:1.
 * 모두 선택 입력이므로 number 로 두되 0 또는 undefined 가 '미입력' 신호.
 */
export interface Measurements {
  height: number;   // 키 cm
  weight: number;   // 몸무게 kg
  neck: number;     // 목둘레
  shoulder: number; // 어깨너비
  chest: number;    // 가슴둘레
  belly: number;    // 배둘레
  waist: number;    // 허리둘레
  hip: number;      // 엉덩이
  thigh: number;    // 허벅지
  sleeve: number;   // 소매길이
  jacket: number;   // 상의길이
  tw: number;       // 바지허리
  tl: number;       // 바지길이
  rise: number;     // 밑위
}

export const MEASUREMENT_KEYS: (keyof Measurements)[] = [
  "height", "weight", "neck", "shoulder", "chest",
  "belly", "waist", "hip", "thigh", "sleeve",
  "jacket", "tw", "tl", "rise",
];

/**
 * 스타일 사양 — 자유 입력 텍스트.
 */
export interface StyleSpec {
  fabric: string;   // 원단
  lining: string;   // 안감
  style: string;    // '싱글 2버튼 / 노치라펠'
  vent: string;     // 벤트
  pocket: string;   // 포켓
}

export type Gender = "남성" | "여성" | "미선택" | "";

/**
 * 고객 한 명 — 기존 CS[name] 객체 구조를 그대로 옮김.
 * orders 는 빈 배열일 수 있음 (신규 등록 직후).
 */
export interface Customer extends Measurements, StyleSpec {
  name: string;
  birth: string;       // '1988.03.15'
  phone: string;       // '010-2345-6789'
  gender: Gender;
  memo: string;
  retailer?: string;   // 소속 소매점명 (자유 입력)
  reg: string;         // '26.01.12' 등록일
  orders: Order[];
}
