/**
 * 서버 컴포넌트용 표 클래스. listkit.tsx 는 "use client" 라 서버 page 가 거기서 문자열 상수(TABLE·TH…)를 import 하면
 * 문자열이 아니라 클라이언트 참조가 와서 className 이 빈 값이 된다(2026-09-30 보고서·호실 화면 실측: 표에 w-full 이 없었다).
 * ponytail: listkit 과 같은 값의 사본. listkit 이 이 파일(또는 공용 plain 모듈)을 import 하도록 바뀌면 사본을 없앤다.
 */
export const TABLE = "w-full border-collapse text-[length:var(--fs-body)]";
export const THEAD = "border-b border-[var(--bd)] bg-sf2/60 text-left text-[12px] font-medium text-t2";
export const TH = "h-[40px] px-3 py-2 font-medium whitespace-nowrap";
export const TR = "animate-rise border-b border-[var(--bd)] last:border-b-0 transition-[background-color] duration-1 ease-out";
export const TD = "px-3 py-2.5 align-middle";
export const PILL =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sf2 px-2 py-[2px] text-[length:var(--fs-meta)] font-semibold leading-[16px] text-t2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,currentColor_14%,transparent)] tabular-nums";
