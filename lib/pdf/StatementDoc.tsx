/**
 * 건물 관리비 명세서 A4 PDF(디자인 스펙 §5, gap-research C-4 배치). InvoiceDoc 의 스타일 규칙(머리 2px 경계·표 1px·합계 박스·바닥글)을
 * 이어받되 본문 11pt 이상(고령 수신자), 흑백 100%, 미납 강조는 굵기와 ※ 로. 호실 여러 장을 한 문서(다중 페이지)로 그린다.
 * 고정 문구 "이 문서는 세금계산서가 아닙니다" 는 설정으로 끌 수 없다. 선택 구역(공지·12개월 막대·절취선)은 features 값에 따른다.
 */
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerKoreanFont } from "./fonts";

registerKoreanFont();

const INK = "#111315";
const GREY = "#5d646b";
const LINE = "#c9cdd1";

const s = StyleSheet.create({
  page: { fontFamily: "NotoSansKR", fontSize: 11, color: INK, paddingTop: 24, paddingBottom: 36, paddingHorizontal: 40, lineHeight: 1.2 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: INK, paddingBottom: 8, marginBottom: 8 },
  kicker: { fontSize: 9.5, color: GREY, marginBottom: 2 },
  h1: { fontSize: 18, fontWeight: "bold" },
  metaRight: { textAlign: "right", fontSize: 9.5 },
  metaLabel: { color: GREY },
  partyRow: { flexDirection: "row", gap: 24, marginBottom: 8 },
  colHead: { fontSize: 9.5, color: GREY, marginBottom: 2, fontWeight: "bold" },
  partyName: { fontSize: 14, fontWeight: "bold" },
  partySub: { fontSize: 11 },
  summaryBox: { borderWidth: 2, borderColor: INK, padding: 10, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dueLabel: { fontSize: 11, color: GREY },
  dueValue: { fontSize: 22, fontWeight: "bold" },
  dueDate: { fontSize: 14, fontWeight: "bold" },
  bank: { fontSize: 11, marginTop: 2 },
  four: { marginBottom: 8, alignItems: "flex-end" },
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
  taxRow: { flexDirection: "row", gap: 18, marginBottom: 4 },
  notTax: { fontSize: 11, fontWeight: "bold", marginBottom: 8 },
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

export interface StatementLine { name: string; category: string; amount: number; prev: number | null; basis: string }
export interface StatementMeter { label: string; prev: number; curr: number; usage: number; unit: string; amount: number | null; note?: string }

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
  /** 12개월 추이(오래된 → 최신). 2개 미만이면 그리지 않는다. */
  chart: { label: string; amount: number }[] | null;
  stub: boolean;
  office: string | null;
  /** 상가 건물이면 14항목 내역 제공 안내. */
  commercial: boolean;
}

/** Noto Sans KR 정적 TTF 에 없는 글리프(2026-09-29 fontTools 실측: ※ ㎥ ㎡ → ○ △ □ ◇ ☆ ▽ ■ ● ㈜ 등) 를 있는 글자로 바꾼다. 없으면 빈 네모·엉뚱한 글자로 찍힌다. */
const GLYPH: Record<string, string> = { "※": "*", "㎥": "m³", "㎡": "m²", "→": ">", "←": "<", "⇒": "=>", "㈜": "(주)", "○": "O", "●": "*", "△": "^", "□": "[]", "■": "[]", "◇": "<>", "☆": "*", "★": "*", "▽": "v", "▶": ">" };
export const pdfSafe = (v: string | null | undefined): string => (v ?? "").replace(/[※㎥㎡→←⇒㈜○●△□■◇☆★▽▶]/g, (c) => GLYPH[c] ?? c);
const won = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
const diff = (n: number | null) => (n == null ? "—" : n > 0 ? `+${won(n)}` : n < 0 ? won(n) : "0원");
const qty = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function StatementPage({ d: raw }: { d: StatementData }) {
  const d: StatementData = {
    ...raw, buildingName: pdfSafe(raw.buildingName), payerName: pdfSafe(raw.payerName), docNo: pdfSafe(raw.docNo), bank: raw.bank && pdfSafe(raw.bank), notice: raw.notice && pdfSafe(raw.notice), office: raw.office && pdfSafe(raw.office),
    lines: raw.lines.map((l) => ({ ...l, name: pdfSafe(l.name), category: pdfSafe(l.category), basis: pdfSafe(l.basis) })),
    meters: raw.meters.map((m) => ({ ...m, label: pdfSafe(m.label), unit: pdfSafe(m.unit), note: m.note && pdfSafe(m.note) })),
  };
  const total = d.lines.reduce((a, l) => a + l.amount, 0);
  const prevTotal = d.lines.every((l) => l.prev != null) && d.lines.length > 0 ? d.lines.reduce((a, l) => a + (l.prev ?? 0), 0) : null;
  const chart = d.chart && d.chart.length >= 2 ? d.chart : null;
  const max = chart ? Math.max(...chart.map((c) => c.amount), 1) : 1;
  return (
    <Page size="A4" style={s.page}>
      <View style={s.headerRow}>
        <View>
          <Text style={s.kicker}>{d.buildingName}</Text>
          <Text style={s.h1}>{d.periodLabel} 관리비 명세서</Text>
        </View>
        <View style={s.metaRight}>
          <Text><Text style={s.metaLabel}>명세서 No. </Text>{d.docNo}</Text>
          <Text><Text style={s.metaLabel}>발행일 </Text>{d.issuedAt}</Text>
          {d.usageRange && <Text><Text style={s.metaLabel}>사용기간 </Text>{d.usageRange}</Text>}
        </View>
      </View>

      <View style={s.partyRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.colHead}>호실</Text>
          <Text style={s.partyName}>{d.unitNo}호</Text>
        </View>
        <View style={{ flex: 2 }}>
          <Text style={s.colHead}>청구받는 분</Text>
          <Text style={s.partyName}>{d.payerName}</Text>
        </View>
      </View>

      <View style={s.summaryBox} wrap={false}>
        <View>
          <Text style={s.dueLabel}>이번 달 낼 돈</Text>
          <Text style={s.dueValue}>{won(d.amountDue)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.dueLabel}>납부기한</Text>
          <Text style={s.dueDate}>{d.dueDate ?? "—"}</Text>
          {d.bank && <Text style={s.bank}>{d.bank}</Text>}
        </View>
      </View>

      <View style={s.four} wrap={false}>
        <View style={s.fourBox}>
          <View style={s.fourRow}><Text style={s.fourLabel}>당월 부과</Text><Text style={s.fourValue}>{won(d.currentCharge)}</Text></View>
          <View style={s.fourRow}><Text style={s.fourLabel}>{d.priorUnpaid > 0 ? "* 전월 미납" : "전월 미납"}</Text><Text style={[s.fourValue, d.priorUnpaid > 0 ? s.bold : {}]}>{won(d.priorUnpaid)}</Text></View>
          {d.lateFee != null && <View style={s.fourRow}><Text style={s.fourLabel}>연체료</Text><Text style={s.fourValue}>{won(d.lateFee)}</Text></View>}
          <View style={s.fourRow}><Text style={s.fourLabel}>선납·감면</Text><Text style={s.fourValue}>{won(-d.credit)}</Text></View>
          <View style={s.fourGrand}><Text style={s.fourGrandText}>납부 요청액</Text><Text style={s.fourGrandText}>{won(d.amountDue)}</Text></View>
        </View>
      </View>

      <Text style={s.sectionHead}>항목별 내역</Text>
      <View style={s.table}>
        <View style={s.thRow}>
          <Text style={[s.th, { flex: 2.6 }]}>항목</Text>
          <Text style={[s.th, s.right, { flex: 1.3 }]}>당월</Text>
          <Text style={[s.th, s.right, { flex: 1.3 }]}>전월</Text>
          <Text style={[s.th, s.right, { flex: 1.2 }]}>증감</Text>
          <Text style={[s.th, { flex: 2.6, paddingLeft: 8 }]}>산출근거</Text>
        </View>
        {d.lines.map((l, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <View style={{ flex: 2.6 }}><Text style={s.td}>{l.name}</Text>{l.category !== l.name && <Text style={s.tdSub}>{l.category}</Text>}</View>
            <Text style={[s.td, s.right, { flex: 1.3 }]}>{won(l.amount)}</Text>
            <Text style={[s.td, s.right, { flex: 1.3 }]}>{l.prev == null ? "—" : won(l.prev)}</Text>
            <Text style={[s.td, s.right, { flex: 1.2 }]}>{diff(l.prev == null ? null : l.amount - l.prev)}</Text>
            <Text style={[s.tdSub, { flex: 2.6, paddingLeft: 8 }]}>{l.basis}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[s.td, s.bold, { flex: 2.6 }]}>합계</Text>
          <Text style={[s.td, s.bold, s.right, { flex: 1.3 }]}>{won(total)}</Text>
          <Text style={[s.td, s.bold, s.right, { flex: 1.3 }]}>{prevTotal == null ? "—" : won(prevTotal)}</Text>
          <Text style={[s.td, s.bold, s.right, { flex: 1.2 }]}>{diff(prevTotal == null ? null : total - prevTotal)}</Text>
          <Text style={{ flex: 2.6 }} />
        </View>
      </View>

      {d.meters.length > 0 && (
        <View wrap={false}>
          <Text style={s.sectionHead}>검침</Text>
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={[s.th, { flex: 1.6 }]}>종류</Text>
              <Text style={[s.th, s.right, { flex: 1.4 }]}>전월 지침</Text>
              <Text style={[s.th, s.right, { flex: 1.4 }]}>당월 지침</Text>
              <Text style={[s.th, s.right, { flex: 1.6 }]}>사용량</Text>
              <Text style={[s.th, s.right, { flex: 1.6 }]}>금액</Text>
              <Text style={[s.th, { flex: 1.6, paddingLeft: 8 }]}>비고</Text>
            </View>
            {d.meters.map((m, i) => (
              <View key={i} style={s.tr}>
                <Text style={[s.td, { flex: 1.6 }]}>{m.label}</Text>
                <Text style={[s.td, s.right, { flex: 1.4 }]}>{qty(m.prev)}</Text>
                <Text style={[s.td, s.right, { flex: 1.4 }]}>{qty(m.curr)}</Text>
                <Text style={[s.td, s.right, { flex: 1.6 }]}>{qty(m.usage)} {m.unit}</Text>
                <Text style={[s.td, s.right, { flex: 1.6 }]}>{m.amount == null ? "—" : won(m.amount)}</Text>
                <Text style={[s.tdSub, { flex: 1.6, paddingLeft: 8 }]}>{m.note ?? ""}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View wrap={false}>
        <Text style={s.sectionHead}>세금 구분</Text>
        <View style={s.taxRow}>
          <Text>공급가액 {won(d.supply)}</Text>
          <Text>부가세 {won(d.vat)}</Text>
          <Text>면세 {won(d.exempt)}</Text>
        </View>
        <Text style={s.notTax}>이 문서는 세금계산서가 아닙니다.</Text>
      </View>

      {d.notice && (
        <View style={s.notice} wrap={false}>
          <Text style={[s.th, { marginBottom: 2 }]}>공지</Text>
          <Text>{d.notice}</Text>
        </View>
      )}

      {chart && (
        <View wrap={false}>
          <Text style={s.sectionHead}>최근 {chart.length}개월 당월 부과액 (단위 만원)</Text>
          <View style={s.chartLabels}>
            {chart.map((c, i) => <Text key={i} style={s.chartValue}>{(c.amount / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}</Text>)}
          </View>
          <View style={s.chart}>
            {chart.map((c, i) => (
              <View key={i} style={[i === chart.length - 1 ? s.barCur : s.bar, { height: Math.max(2, (c.amount / max) * 44) }]} />
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

      <View style={s.footer} fixed>
        {d.office && <Text>{d.office}</Text>}
        {d.commercial && <Text>관리비 14개 항목별 금액은 요청하시면 제공합니다(상가건물 임대차보호법 시행령 별표1).</Text>}
      </View>
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
