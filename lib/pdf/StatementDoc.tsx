/**
 * 건물 관리비 명세서 A4 PDF(디자인 스펙 §5, gap-research C-4 배치). InvoiceDoc 의 스타일 규칙(머리 2px 경계·표 1px·합계 박스·바닥글)을
 * 이어받되 본문 11pt 이상(고령 수신자), 흑백 100%, 미납 강조는 굵기와 ※ 로. 호실 여러 장을 한 문서(다중 페이지)로 그린다.
 * 고정 문구 "이 문서는 세금계산서가 아닙니다" 는 설정으로 끌 수 없다. 선택 구역(공지·12개월 막대·절취선)은 features 값에 따른다.
 * 2026-09-30 P0 보강: 관리주체·호실 면적, 항목별 공급가/부가세/면세, 상가 14항목 소계, 미납액 달별 내역, 연체료 산식, 이의·문의 안내(순수 함수는 statement-p0.ts).
 * A4 한 장이 원칙 — 줄이 많으면 dense(0~2)로 표 글자·간격을 줄이고, 그래도 넘치면 2쪽으로 흐른다.
 */
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerKoreanFont } from "./fonts";
import { won, type Law14Table, type PriorUnpaidRow } from "./statement-p0";

registerKoreanFont();

const INK = "#111315";
const GREY = "#5d646b";
const LINE = "#c9cdd1";

const s = StyleSheet.create({
  page: { fontFamily: "NotoSansKR", fontSize: 11, color: INK, paddingTop: 24, paddingBottom: 46, paddingHorizontal: 40, lineHeight: 1.2 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: INK, paddingBottom: 8, marginBottom: 8 },
  kicker: { fontSize: 9.5, color: GREY, marginBottom: 2 },
  h1: { fontSize: 18, fontWeight: "bold" },
  metaRight: { textAlign: "right", fontSize: 9.5 },
  metaLabel: { color: GREY },
  supplier: { fontSize: 9.5, color: GREY, marginBottom: 6 },
  partyRow: { flexDirection: "row", gap: 24, marginBottom: 8 },
  colHead: { fontSize: 9.5, color: GREY, marginBottom: 2, fontWeight: "bold" },
  partyName: { fontSize: 14, fontWeight: "bold" },
  partySub: { fontSize: 11 },
  summaryBox: { borderWidth: 2, borderColor: INK, padding: 10, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dueLabel: { fontSize: 11, color: GREY },
  dueValue: { fontSize: 22, fontWeight: "bold" },
  dueDate: { fontSize: 14, fontWeight: "bold" },
  bank: { fontSize: 11, marginTop: 2 },
  fourWrap: { flexDirection: "row", gap: 16, marginBottom: 8 },
  fourBox: { width: 300 },
  fourRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  fourLabel: { fontSize: 11, color: GREY },
  fourValue: { fontSize: 11 },
  fourGrand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: INK, marginTop: 3, paddingTop: 4 },
  fourGrandText: { fontSize: 12.5, fontWeight: "bold" },
  sectionHead: { fontSize: 9.5, color: GREY, fontWeight: "bold", marginBottom: 4, marginTop: 4 },
  table: { borderTopWidth: 1, borderTopColor: INK, marginBottom: 8 },
  thRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingVertical: 3 },
  th: { fontSize: 9.5, fontWeight: "bold" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 2 },
  td: { fontSize: 11 },
  tdSub: { fontSize: 9.5, color: GREY },
  right: { textAlign: "right" },
  totalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: INK, paddingVertical: 5 },
  bold: { fontWeight: "bold" },
  cell2: { flexDirection: "row", gap: 16 },
  cellHalf: { flex: 1 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 1.5 },
  small: { fontSize: 9.5, color: GREY },
  dispute: { borderWidth: 1, borderColor: INK, padding: 6, marginBottom: 8 },
  notTax: { fontSize: 10, fontWeight: "bold", marginBottom: 6 },
  notice: { borderWidth: 1, borderColor: LINE, padding: 6, fontSize: 10, marginBottom: 8 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 44, marginBottom: 2 },
  bar: { flex: 1, backgroundColor: INK },
  barCur: { flex: 1, backgroundColor: GREY },
  chartLabels: { flexDirection: "row", gap: 4, marginBottom: 2 },
  chartValue: { flex: 1, fontSize: 7.5, textAlign: "center" },
  chartLabel: { flex: 1, fontSize: 7.5, color: GREY, textAlign: "center" },
  stub: { borderTopWidth: 1, borderTopColor: INK, borderStyle: "dashed", marginTop: 8, paddingTop: 8 },
  stubRow: { flexDirection: "row", justifyContent: "space-between", fontSize: 10 },
  footer: { position: "absolute", left: 40, right: 40, bottom: 20, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6, fontSize: 10, color: GREY },
});

/** supply·vat·exempt·amount 는 서버(trace.lines)가 준 값 그대로. tax 는 항목의 부가세 처리 이름. */
export interface StatementLine { name: string; category: string; amount: number; prev: number | null; basis: string; supply: number; vat: number; exempt: number; tax: string }
/** 선택 3개(multiplier·price·avg)는 관리자 명세서 route 만 채운다(QR 조회 쪽은 아직 안 채움 → 배율·단가는 "—", 평균 줄 없음). multiplier = 검침 배율. price = 서버 청구 계산의 단가(원, 없으면 null). avg = "건물 평균 … 평균보다 +12%" 한 줄(같은 종류 계량기 3개 미만이면 null, 다른 호실 정보 없음). */
export interface StatementMeter { label: string; prev: number; curr: number; usage: number; unit: string; amount: number | null; note?: string; multiplier?: number; price?: number | null; avg?: string | null }

export interface StatementData {
  buildingName: string;
  /** "2026년 9월분" */
  periodLabel: string;
  docNo: string;
  issuedAt: string;
  unitNo: string;
  payerName: string;
  usageRange: string | null;
  dueDate: string | null;
  bank: string | null;
  amountDue: number;
  currentCharge: number;
  priorUnpaid: number;
  /** null 이면 연체료 줄을 그리지 않는다(기능 꺼짐). */
  lateFee: number | null;
  credit: number;
  supply: number;
  vat: number;
  exempt: number;
  lines: StatementLine[];
  meters: StatementMeter[];
  notice: string | null;
  /** 건물 주소(있을 때). */
  buildingAddress: string | null;
  /** 관리주체(공급자) 머리 줄. 없으면 빈 배열. */
  supplier: string[];
  /** 동·층·용도·면적 한 줄. */
  unitInfo: string;
  /** 상가일 때만: 14항목 소계표. */
  law14: Law14Table | null;
  /** 미납액 달별 내역(없으면 빈 배열). priorMismatch = 표 합계가 위 "미납액"과 다를 때. */
  priorRows: PriorUnpaidRow[];
  priorMismatch: boolean;
  /** 연체료 산식 줄. */
  lateFormula: { lines: string[]; more: { count: number; amount: number } | null } | null;
  /** 이의·문의 안내(항상). */
  dispute: { text: string; office: string | null };
  /** 표 글자 단계 0 보통 · 1 줄임 · 2 더 줄임. */
  dense: 0 | 1 | 2;
  /** 12개월 추이(오래된 → 최신). 2개 미만이면 그리지 않는다. */
  chart: { label: string; amount: number }[] | null;
  stub: boolean;
  /** 상가 건물이면 14항목 내역 제공 안내. */
  commercial: boolean;
}

/** Noto Sans KR 정적 TTF 에 없는 글리프(2026-09-29 fontTools 실측: ※ ㎥ ㎡ → ○ △ □ ◇ ☆ ▽ ■ ● ㈜ 등) 를 있는 글자로 바꾼다. 없으면 빈 네모·엉뚱한 글자로 찍힌다. */
const GLYPH: Record<string, string> = { "※": "*", "㎥": "m³", "㎡": "m²", "→": ">", "←": "<", "⇒": "=>", "㈜": "(주)", "○": "O", "●": "*", "△": "^", "□": "[]", "■": "[]", "◇": "<>", "☆": "*", "★": "*", "▽": "v", "▶": ">" };
export const pdfSafe = (v: string | null | undefined): string => (v ?? "").replace(/[※㎥㎡→←⇒㈜○●△□■◇☆★▽▶]/g, (c) => GLYPH[c] ?? c);
/** 항목 표 칸 너비 비율(항목·부가세 전·부가세·면세 금액·이번 달·지난달·차이·계산 방법). */
const COL = [2.7, 1.15, 0.95, 1.1, 1.2, 1.2, 0.95, 1.45];
const diff = (n: number | null) => (n == null ? "—" : n > 0 ? `+${won(n)}` : n < 0 ? won(n) : "0원");
const qty = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function StatementPage({ d: raw }: { d: StatementData }) {
  const d: StatementData = {
    ...raw, buildingName: pdfSafe(raw.buildingName), payerName: pdfSafe(raw.payerName), docNo: pdfSafe(raw.docNo), bank: raw.bank && pdfSafe(raw.bank), notice: raw.notice && pdfSafe(raw.notice),
    buildingAddress: raw.buildingAddress && pdfSafe(raw.buildingAddress), supplier: raw.supplier.map(pdfSafe), unitInfo: pdfSafe(raw.unitInfo),
    dispute: { text: pdfSafe(raw.dispute.text), office: raw.dispute.office && pdfSafe(raw.dispute.office) },
    lines: raw.lines.map((l) => ({ ...l, name: pdfSafe(l.name), category: pdfSafe(l.category), basis: pdfSafe(l.basis) })),
    meters: raw.meters.map((m) => ({ ...m, label: pdfSafe(m.label), unit: pdfSafe(m.unit), avg: m.avg && pdfSafe(m.avg), note: m.note && pdfSafe(m.note) })),
  };
  const total = d.lines.reduce((a, l) => a + l.amount, 0);
  const prevTotal = d.lines.every((l) => l.prev != null) && d.lines.length > 0 ? d.lines.reduce((a, l) => a + (l.prev ?? 0), 0) : null;
  const chart = d.chart && d.chart.length >= 2 ? d.chart : null;
  const max = chart ? Math.max(...chart.map((c) => c.amount), 1) : 1;
  // 표 글자·간격 단계(한 장에 맞추기): 보통 → 줄임 → 더 줄임.
  const fs = [11, 10, 9][d.dense], sub = [9.5, 8.5, 8][d.dense], pv = [2, 1.5, 0.8][d.dense];
  const td = { fontSize: fs }, tds = { fontSize: sub, color: GREY }, tds1 = { fontSize: sub + 1 }, kvp = [1.5, 1, 0.5][d.dense];
  const law = d.law14;
  const lawHalf = law && !law.amountsHidden ? [law.rows.slice(0, 7), law.rows.slice(7)] : null;
  return (
    <Page size="A4" style={s.page}>
      <View style={s.headerRow}>
        <View>
          <Text style={s.kicker}>{d.buildingName}{d.buildingAddress ? ` · ${d.buildingAddress}` : ""}</Text>
          <Text style={s.h1}>{d.periodLabel} 관리비 명세서</Text>
        </View>
        <View style={s.metaRight}>
          <Text><Text style={s.metaLabel}>명세서 No. </Text>{d.docNo}</Text>
          <Text><Text style={s.metaLabel}>발행일 </Text>{d.issuedAt}</Text>
          {d.usageRange && <Text><Text style={s.metaLabel}>사용기간 </Text>{d.usageRange}</Text>}
        </View>
      </View>
      {d.supplier.length > 0 && <View style={s.supplier}>{d.supplier.map((x, i) => <Text key={i}>{x}</Text>)}</View>}

      <View style={s.partyRow}>
        <View style={{ flex: 1.4 }}>
          <Text style={s.colHead}>호실</Text>
          <Text style={s.partyName}>{d.unitNo}호</Text>
          {d.unitInfo ? <Text style={[s.small, { marginTop: 2 }]}>{d.unitInfo}</Text> : null}
        </View>
        <View style={{ flex: 2 }}>
          <Text style={s.colHead}>납부자</Text>
          <Text style={s.partyName}>{d.payerName}</Text>
        </View>
      </View>

      <View style={[s.summaryBox, { padding: [10, 7, 5][d.dense] }]} wrap={false}>
        <View>
          <Text style={s.dueLabel}>이번 달 납부액</Text>
          <Text style={[s.dueValue, { fontSize: [22, 20, 18][d.dense] }]}>{won(d.amountDue)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.dueLabel}>납부기한</Text>
          <Text style={s.dueDate}>{d.dueDate ?? "—"}</Text>
          {d.bank && <Text style={s.bank}>{d.bank}</Text>}
        </View>
      </View>

      <View style={s.fourWrap} wrap={false}>
        <View style={{ flex: 1 }}>
          {(d.priorRows.length > 0 || d.priorMismatch) && (
            <>
              <Text style={[s.colHead, { marginBottom: 3 }]}>전월까지 미납액, 달별 내역</Text>
              {d.priorRows.map((r, i) => (
                <View key={i} style={[s.kvRow, { paddingVertical: kvp }]}><Text style={tds1}>{r.label}</Text><Text style={tds1}>{won(r.amount)}</Text></View>
              ))}
              {d.priorMismatch && <Text style={[tds, { marginTop: 2 }]}>{d.priorRows.length > 0 ? "* 명세서를 만든 뒤 수납액이 있으면 위 금액과 다를 수 있습니다." : "* 달별 내역이 없습니다. 궁금하면 관리사무소에 문의해 주세요."}</Text>}
            </>
          )}
        </View>
        <View style={s.fourBox}>
          <View style={s.fourRow}><Text style={s.fourLabel}>이번 달 관리비</Text><Text style={s.fourValue}>{won(d.currentCharge)}</Text></View>
          <View style={s.fourRow}><Text style={s.fourLabel}>{d.priorUnpaid > 0 ? "* 전월까지 미납액" : "전월까지 미납액"}</Text><Text style={[s.fourValue, d.priorUnpaid > 0 ? s.bold : {}]}>{won(d.priorUnpaid)}</Text></View>
          {d.lateFee != null && <View style={s.fourRow}><Text style={s.fourLabel}>연체료</Text><Text style={s.fourValue}>{won(d.lateFee)}</Text></View>}
          <View style={s.fourRow}><Text style={s.fourLabel}>선납금·감면액</Text><Text style={s.fourValue}>{won(-d.credit)}</Text></View>
          <View style={s.fourGrand}><Text style={s.fourGrandText}>이번 달 납부액</Text><Text style={s.fourGrandText}>{won(d.amountDue)}</Text></View>
        </View>
      </View>

      <Text style={s.sectionHead}>항목별 내역</Text>
      <View style={s.table}>
        <View style={s.thRow}>
          <Text style={[s.th, { flex: COL[0] }]}>항목</Text>
          <Text style={[s.th, s.right, { flex: COL[1] }]}>공급가액</Text>
          <Text style={[s.th, s.right, { flex: COL[2] }]}>부가세</Text>
          <Text style={[s.th, s.right, { flex: COL[3] }]}>면세 금액</Text>
          <Text style={[s.th, s.right, { flex: COL[4] }]}>이번 달</Text>
          <Text style={[s.th, s.right, { flex: COL[5] }]}>지난달</Text>
          <Text style={[s.th, s.right, { flex: COL[6] }]}>차이</Text>
          <Text style={[s.th, { flex: COL[7], paddingLeft: 8 }]}>계산 방법</Text>
        </View>
        {d.lines.map((l, i) => (
          <View key={i} style={[s.tr, { paddingVertical: pv }]} wrap={false}>
            <View style={{ flex: COL[0] }}>
              <Text style={td}>{l.name}{d.dense > 0 ? <Text style={tds}>  {l.tax}</Text> : null}</Text>
              {d.dense === 0 && <Text style={tds}>{l.category !== l.name ? `${l.category} · ` : ""}{l.tax}</Text>}
            </View>
            <Text style={[td, s.right, { flex: COL[1] }]}>{won(l.supply)}</Text>
            <Text style={[td, s.right, { flex: COL[2] }]}>{won(l.vat)}</Text>
            <Text style={[td, s.right, { flex: COL[3] }]}>{won(l.exempt)}</Text>
            <Text style={[td, s.right, { flex: COL[4] }]}>{won(l.amount)}</Text>
            <Text style={[td, s.right, { flex: COL[5] }]}>{l.prev == null ? "—" : won(l.prev)}</Text>
            <Text style={[tds, s.right, { flex: COL[6] }]}>{diff(l.prev == null ? null : l.amount - l.prev)}</Text>
            <Text style={[tds, { flex: COL[7], paddingLeft: 8 }]}>{l.basis}</Text>
          </View>
        ))}
        <View style={[s.totalRow, { paddingVertical: pv + 2 }]} wrap={false}>
          <Text style={[td, s.bold, { flex: COL[0] }]}>합계</Text>
          <Text style={[td, s.bold, s.right, { flex: COL[1] }]}>{won(d.supply)}</Text>
          <Text style={[td, s.bold, s.right, { flex: COL[2] }]}>{won(d.vat)}</Text>
          <Text style={[td, s.bold, s.right, { flex: COL[3] }]}>{won(d.exempt)}</Text>
          <Text style={[td, s.bold, s.right, { flex: COL[4] }]}>{won(total)}</Text>
          <Text style={[td, s.bold, s.right, { flex: COL[5] }]}>{prevTotal == null ? "—" : won(prevTotal)}</Text>
          <Text style={[tds, s.right, { flex: COL[6] }]}>{diff(prevTotal == null ? null : total - prevTotal)}</Text>
          <Text style={{ flex: COL[7] }} />
        </View>
        <Text style={s.notTax}>이 문서는 세금계산서가 아닙니다.</Text>
      </View>

      {law && (
        <View wrap={false}>
          <Text style={s.sectionHead}>상가 관리비 14개 항목별 내역 (상가건물 임대차보호법 시행령 제8조)</Text>
          <View style={[s.table, { marginBottom: 6 }]}>
            {law.amountsHidden ? (
              <View style={{ paddingVertical: 3 }}>
                <Text style={[td, { marginBottom: 1 }]}>월 관리비가 10만 원 미만이라 금액 없이, 이 관리비에 들어 있는 항목만 알려 드립니다.</Text>
                <Text style={[td, s.bold]}>{law.rows.filter((r) => r.included).map((r) => r.label).join(", ") || "—"}</Text>
              </View>
            ) : (
              <View style={s.cell2}>
                {lawHalf!.map((half, c) => (
                  <View key={c} style={s.cellHalf}>
                    {half.map((r) => (
                      <View key={r.no} style={[s.kvRow, { paddingVertical: kvp }]}>
                        <Text style={td}>{r.no}. {r.label}</Text>
                        <Text style={[td, r.included ? {} : { color: GREY }]}>{r.included ? won(r.amount) : "해당 없음"}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
            {law.outside.length > 0 && <Text style={[tds, { marginTop: 2 }]}>14항목 밖: {law.outside.map((o) => `${o.label} ${won(o.amount)}`).join(" · ")}</Text>}
          </View>
        </View>
      )}

      {d.lateFormula && d.lateFormula.lines.length > 0 && (
        <View wrap={false} style={{ marginBottom: 6 }}>
          <Text style={s.sectionHead}>연체료 계산 방법</Text>
          {d.lateFormula.lines.map((x, i) => <Text key={i} style={td}>{x}</Text>)}
          {d.lateFormula.more && <Text style={tds}>그 밖 {d.lateFormula.more.count}건 {won(d.lateFormula.more.amount)}</Text>}
        </View>
      )}

      {d.meters.length > 0 && (
        <View wrap={false}>
          <Text style={s.sectionHead}>계량기 검침</Text>
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={[s.th, { flex: 1.5 }]}>종류</Text>
              <Text style={[s.th, s.right, { flex: 1.2 }]}>전월 지침</Text>
              <Text style={[s.th, s.right, { flex: 1.2 }]}>당월 지침</Text>
              <Text style={[s.th, s.right, { flex: 0.7 }]}>배율</Text>
              <Text style={[s.th, s.right, { flex: 1.5 }]}>사용량</Text>
              <Text style={[s.th, s.right, { flex: 1.1 }]}>단가</Text>
              <Text style={[s.th, s.right, { flex: 1.4 }]}>금액</Text>
              <Text style={[s.th, { flex: 2.3, paddingLeft: 8 }]}>건물 평균 대비 · 비고</Text>
            </View>
            {d.meters.map((m, i) => (
              <View key={i} style={[s.tr, { paddingVertical: pv }]}>
                <Text style={[td, { flex: 1.5 }]}>{m.label}</Text>
                <Text style={[td, s.right, { flex: 1.2 }]}>{qty(m.prev)}</Text>
                <Text style={[td, s.right, { flex: 1.2 }]}>{qty(m.curr)}</Text>
                <Text style={[td, s.right, { flex: 0.7 }]}>{m.multiplier == null ? "—" : `×${qty(m.multiplier)}`}</Text>
                <Text style={[td, s.right, { flex: 1.5 }]}>{qty(m.usage)} {m.unit}</Text>
                <Text style={[td, s.right, { flex: 1.1 }]}>{m.price == null ? "—" : `${qty(m.price)}원`}</Text>
                <Text style={[td, s.right, { flex: 1.4 }]}>{m.amount == null ? "—" : won(m.amount)}</Text>
                <View style={{ flex: 2.3, paddingLeft: 8 }}>
                  {m.avg ? <Text style={tds}>{m.avg}</Text> : null}
                  {m.note ? <Text style={tds}>{m.note}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {d.notice && (
        <View style={[s.notice, { padding: [6, 5, 4][d.dense], marginBottom: [8, 6, 5][d.dense] }]} wrap={false}>
          <Text style={[s.th, { marginBottom: 2 }]}>공지</Text>
          <Text>{d.notice}</Text>
        </View>
      )}

      <View style={[s.dispute, { padding: [6, 5, 4][d.dense], marginBottom: [8, 6, 5][d.dense] }]} wrap={false}>
        <Text style={[s.th, { marginBottom: 2 }]}>문의·이의 안내</Text>
        <Text style={{ fontSize: sub + 1 }}>{d.dispute.text}</Text>
        {d.dispute.office && <Text style={{ fontSize: sub + 1, fontWeight: "bold" }}>관리사무소 {d.dispute.office}</Text>}
      </View>

      {chart && (
        <View wrap={false}>
          <Text style={s.sectionHead}>최근 {chart.length}개월 관리비 (단위 만원)</Text>
          <View style={s.chartLabels}>
            {chart.map((c, i) => <Text key={i} style={s.chartValue}>{(c.amount / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}</Text>)}
          </View>
          <View style={s.chart}>
            {chart.map((c, i) => (
              <View key={i} style={[i === chart.length - 1 ? s.barCur : s.bar, { height: Math.max(2, (c.amount / max) * [44, 34, 26][d.dense]) }]} />
            ))}
          </View>
          <View style={s.chartLabels}>
            {chart.map((c, i) => <Text key={i} style={s.chartLabel}>{c.label}</Text>)}
          </View>
        </View>
      )}

      {d.stub && (
        <View style={s.stub} wrap={false}>
          <View style={s.stubRow}><Text style={s.bold}>납부서 (관리사무소 보관용)</Text><Text>{d.buildingName} · {d.periodLabel}</Text></View>
          <View style={s.stubRow}><Text>{d.unitNo}호 · {d.payerName}</Text><Text style={s.bold}>{won(d.amountDue)} · 기한 {d.dueDate ?? "—"}</Text></View>
        </View>
      )}

      {d.commercial && !(d.law14 && !d.law14.amountsHidden) && (
        <View style={s.footer} fixed>
          <Text>관리비 14개 항목별 금액은 요청하시면 제공합니다(상가건물 임대차보호법 시행령 제8조).</Text>
        </View>
      )}
    </Page>
  );
}

export function StatementDoc({ items }: { items: StatementData[] }) {
  return (
    <Document title={items[0] ? `${items[0].buildingName} ${items[0].periodLabel} 관리비 명세서` : "관리비 명세서"}>
      {items.map((d, i) => <StatementPage key={i} d={d} />)}
    </Document>
  );
}
