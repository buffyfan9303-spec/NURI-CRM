/**
 * 건물 관리비 입력칸 폭(2026-09-30 사용자 지시: "금액만 입력할 건데 칸이 너무 크다, 한 화면에 들어가게").
 * 칸 폭은 들어갈 글자 길이에 맞춘다. 휴대폰(<sm)은 전폭 세로, sm 이상은 아래 폭으로 한 줄에 흘린다.
 * html{font-size:14px} 라 rem 이 줄어드므로 px 로 적는다(명세의 14rem·11rem·16rem·24rem 을 16px 기준으로 환산한 뒤 17px 글자에 맞춰 조정).
 *
 * 쓰는 법: <form className={FORM_ROW}> 안의 Input/SelectField 에 wrapperClassName={FW.money} 처럼 준다.
 * 금액 입력은 className={MONEY_INPUT}(오른쪽 정렬·고정폭 숫자)을 같이 준다.
 */
export const FW = {
  /** 금액(최대 12자리 + 쉼표) */
  money: "mb-0 w-full sm:w-[200px]",
  /** 날짜·월(input type=date/month, 달력 아이콘 포함) */
  date: "mb-0 w-full sm:w-[184px]",
  /** 짧은 선택(단계·방법·종류·용도). 가장 긴 선택지에 맞춰 늘어난다. */
  select: "mb-0 w-full sm:w-auto sm:min-w-[128px] sm:max-w-[280px]",
  /** 이름·거래처·상호 */
  name: "mb-0 w-full sm:w-[240px]",
  /** 증빙 번호·계량기 번호 */
  doc: "mb-0 w-full sm:w-[200px]",
  /** 메모·사유 한 줄 */
  memo: "mb-0 w-full sm:w-[360px]",
  /** 동·층·호실·면적·비율 같은 짧은 숫자·글자 */
  short: "mb-0 w-full sm:w-[128px]",
  /** 대표자·업태·종목처럼 짧은 이름 */
  mid: "mb-0 w-full sm:w-[160px]",
} as const;

/** 칸을 한 줄에 흘리는 폼. 라벨 윗선을 맞추려고 items-start(도움말이 있는 칸이 있어도 입력칸 높이가 맞는다). */
export const FORM_ROW = "flex flex-wrap items-start gap-x-4 gap-y-3";
/** 폼 맨 아래 버튼 줄(항상 새 줄). */
export const FORM_ACTIONS = "flex w-full flex-wrap items-center gap-2 pt-1";
/** 금액 입력칸 글자 정렬 */
export const MONEY_INPUT = "text-right tabular-nums";
