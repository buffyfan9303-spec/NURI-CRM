/**
 * 로그인 화면 좌측 패널에서 업종을 고르면 아래 보여줄 "실제 업무 흐름" 상수(§5.4).
 * lib/industry/config.ts는 읽기 전용이라 표시용 문구는 이 파일에 따로 둔다.
 * 권한/기능 판정에는 쓰지 않는다 — 순수 안내 문구다.
 */
import type { Industry } from "@/lib/industry/config";

export const INDUSTRY_WORKFLOW: Record<Industry, string[]> = {
  factory: ["수주", "공정 배정", "가봉·검수", "출고"],
  rental: ["예약", "피팅", "출고", "반납", "정산"],
  unmanned: ["입고", "진열·점검", "판매", "실사"],
  salon: ["예약", "접수", "시술", "수납"],
  academy: ["수강 등록", "시간표 배정", "출결", "미납 확인"],
};
