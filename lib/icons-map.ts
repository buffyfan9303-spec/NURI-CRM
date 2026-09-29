/**
 * 업종·상태 아이콘 맵. lib/icons.ts(순수 배럴)에서 분리 — 분리 이유는 그 파일 머리말.
 */
import { Building2, CheckCircle2, CircleAlert, Factory, Info, School, Scissors, Shirt, Store, TriangleAlert } from "@/lib/icons";

/** 업종 → 아이콘. `lib/industry/config.ts` 의 `icon` 문자열이 Tabler 이름이라 여기서 변환한다. */
export const INDUSTRY_ICON = {
  factory: Factory,
  rental: Shirt, // Phosphor 2.1 에도 Hanger 가 없다(실측). 의류 = TShirt 가 가장 가깝다.
  unmanned: Store,
  salon: Scissors,
  academy: School,
  building: Building2, // 0031 건물 관리비
} as const;

/** 알 수 없는 업종 키로 떨어질 때의 대체 아이콘. */
export const FALLBACK_ICON = Building2;

/** 상태 → 아이콘. 색만으로 상태를 전달하지 않기 위한 짝(§5.3·dataviz). */
export const STATUS_ICON = {
  ok: CheckCircle2,
  warn: TriangleAlert,
  error: CircleAlert,
  info: Info,
} as const;

/** 레퍼런스 §4.1 기준 크기. 임의 px 을 흩뿌리지 않는다. */
export const ICON_SIZE = {
  nav: 18,
  topbar: 18,
  inline: 14,
  empty: 30,
} as const;
