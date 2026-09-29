/**
 * 건물 관리비 선택 기능 31개의 화면 문구와 묶음. 키 목록은 lib/domain/building-types.ts 와 같아야 한다(ops.test.ts 가 대조).
 * 문구는 0031 bld_feature_defs.label 과 같은 뜻이다. approval=true 는 켜도 계약 값 승인 전에는 계산·발행하지 않는 기능.
 */
import type { BuildingFeatureKey } from "@/lib/domain/building-types";

export interface FeatureInfo { label: string; note?: string; approval?: boolean }
export const FEATURE_GROUPS: { title: string; keys: BuildingFeatureKey[] }[] = [
  { title: "청구·연체", keys: ["late_fee", "deposit", "rent", "rent_escalation", "extra_fees", "cam_reconciliation", "budget", "self_approve"] },
  { title: "검침", keys: ["meter_gas", "meter_heat", "meter_multi", "meter_remote_import"] },
  { title: "세금계산서", keys: ["tax_invoice", "tax_invoice_asp"] },
  { title: "입금·발송(외부 서비스)", keys: ["virtual_account", "auto_debit", "bank_auto_fetch", "alimtalk", "email_statement"] },
  { title: "명세서", keys: ["statement_qr", "statement_stub", "statement_chart", "statement_notice"] },
  { title: "운영·보고", keys: ["tenant_portal", "work_orders", "inspections", "long_term_repair", "owners_report", "kapt_export", "vendor_payables", "listing_fee_summary"] },
];
export const FEATURE_INFO: Record<BuildingFeatureKey, FeatureInfo> = {
  late_fee: { label: "연체료(늦게 내면 붙는 돈)", note: "계약마다 연체료 조건을 확정한 뒤에만 계산합니다.", approval: true },
  tax_invoice: { label: "세금계산서 홈택스 일괄 파일", note: "세금계산서 화면이 열립니다. 항목의 부가세 확인을 받기 전에는 대상이 되지 않습니다.", approval: true },
  tax_invoice_asp: { label: "세금계산서 등록 ASP 연동", approval: true },
  deposit: { label: "보증금 관리" },
  rent: { label: "임대료 같이 청구" },
  rent_escalation: { label: "임대료 인상 일정" },
  cam_reconciliation: { label: "연말에 실제 쓴 돈으로 다시 맞추기", approval: true },
  budget: { label: "예산 대비 실적" },
  meter_gas: { label: "가스 검침" },
  meter_heat: { label: "온수·난방 검침" },
  meter_multi: { label: "호실당 계량기 여러 개" },
  meter_remote_import: { label: "원격 계량기 파일 읽기" },
  virtual_account: { label: "가상계좌·PG 입금", approval: true },
  auto_debit: { label: "자동이체(CMS)" },
  bank_auto_fetch: { label: "은행 거래 자동 조회", approval: true },
  alimtalk: { label: "알림톡 발송" },
  email_statement: { label: "이메일 명세서" },
  statement_qr: { label: "명세서 QR" },
  statement_stub: { label: "잘라 쓰는 납부 영수증" },
  statement_chart: { label: "명세서 12개월 그래프" },
  statement_notice: { label: "명세서 공지 칸" },
  tenant_portal: { label: "입주자 포털" },
  work_orders: { label: "민원·수리 작업지시", note: "민원·수리 메뉴가 열립니다." },
  inspections: { label: "법정 점검·용역 일정", note: "점검·일정 메뉴가 열립니다." },
  long_term_repair: { label: "장기수선충당금" },
  owners_report: { label: "관리단 보고서" },
  kapt_export: { label: "K-apt 공개용 집계" },
  vendor_payables: { label: "업체에 줄 돈 기록" },
  extra_fees: { label: "주차비·TV수신료 등 부가 항목" },
  listing_fee_summary: { label: "임대 광고용 관리비 요약" },
  self_approve: { label: "혼자 확정 허용(담당자가 한 명일 때)", note: "켜면 계산한 사람이 직접 금액을 확정할 수 있습니다. 이유를 꼭 남겨야 합니다." },
};
