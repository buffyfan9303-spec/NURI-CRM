/**
 * 보고서 화면의 보기(탭) 이름표. 서버 화면(report-views)과 위쪽 경로 표시(WorkspaceShell, 클라이언트)가 같이 쓰므로
 * 서버 전용 import 가 없는 plain 모듈로 둔다.
 * label = 탭 글자, title = 화면 제목이자 맨 위 경로 표시.
 */
export type ReportView = "settle" | "owners" | "budget" | "repair" | "law14";

export const REPORT_TABS: { key: ReportView; label: string; title: string }[] = [
  { key: "settle", label: "월별 정산", title: "월별 정산 보고서" },
  { key: "owners", label: "소유자·관리단 보고", title: "소유자·관리단 월 보고서" },
  { key: "budget", label: "예산", title: "예산 대비 실적" },
  { key: "repair", label: "장기수선충당금", title: "장기수선충당금" },
  { key: "law14", label: "상가 14항목", title: "상가 14항목 내역" },
];

export const parseView = (v: string | string[] | undefined | null): ReportView => {
  const s = Array.isArray(v) ? v[0] : v;
  return REPORT_TABS.some((t) => t.key === s && t.key !== "settle") ? (s as ReportView) : "settle";
};

/** 보고서(reports) 화면의 현재 탭 제목. */
export const reportTitle = (v: string | string[] | undefined | null): string => REPORT_TABS.find((t) => t.key === parseView(v))!.title;
