/**
 * 렌탈 손상 청구서·학원 수강료 청구서가 같이 쓰는 A4 PDF 레이아웃.
 * 인쇄 페이지(app/…/print/page.tsx)의 HTML 청구서와 같은 구성(머리·당사자·품목·합계)을
 * @react-pdf/renderer 컴포넌트로 옮긴 것 — 두 문서 다 이 하나만 쓴다.
 */
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerKoreanFont } from "./fonts";

registerKoreanFont();

const styles = StyleSheet.create({
  page: { fontFamily: "NotoSansKR", fontSize: 10.5, color: "#111315", padding: 40 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#111315", paddingBottom: 14, marginBottom: 18 },
  kicker: { fontSize: 9, color: "#5d646b", marginBottom: 3 },
  h1: { fontSize: 18, fontWeight: "bold" },
  metaRight: { textAlign: "right", fontSize: 9.5 },
  metaLabel: { color: "#5d646b" },
  twoCol: { flexDirection: "row", gap: 24, marginBottom: 18 },
  colHead: { fontSize: 9, color: "#5d646b", marginBottom: 4, fontWeight: "bold" },
  partyName: { fontSize: 12.5, fontWeight: "bold", marginBottom: 2 },
  partySub: { fontSize: 9.5, color: "#5d646b" },
  sectionHead: { fontSize: 9, color: "#5d646b", fontWeight: "bold", marginBottom: 6 },
  table: { borderTopWidth: 1, borderTopColor: "#111315" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e3e6e8", paddingVertical: 6 },
  thRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111315", paddingBottom: 4, marginBottom: 2 },
  th: { fontSize: 9, fontWeight: "bold" },
  td: { fontSize: 10 },
  tdSub: { fontSize: 8.5, color: "#5d646b", marginTop: 2 },
  right: { textAlign: "right" },
  totals: { marginTop: 18, alignItems: "flex-end" },
  totalsBox: { width: 260 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontSize: 9.5, color: "#5d646b" },
  totalValue: { fontSize: 10 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 2, borderTopColor: "#111315", marginTop: 4, paddingTop: 6 },
  grandLabel: { fontSize: 11, fontWeight: "bold" },
  grandValue: { fontSize: 13, fontWeight: "bold" },
  footer: { marginTop: 28, borderTopWidth: 1, borderTopColor: "#e3e6e8", paddingTop: 10, fontSize: 8.5, color: "#5d646b" },
});

export interface InvoiceLineItem {
  col1: string;
  col2: string;
  col3: string;
  amount: string;
}

export interface InvoiceDocProps {
  kicker: string;
  businessName: string;
  docNo: string;
  issuedAtLabel: string;
  partyHead: string;
  partyName: string;
  partySub: string;
  detailHead: string;
  detailLine1: string;
  detailLine2?: string;
  tableHeaders: [string, string, string, string];
  items: InvoiceLineItem[];
  totalRows: [string, string][];
  grandLabel: string;
  grandValue: string;
  footerLines: string[];
}

export function InvoiceDoc(p: InvoiceDocProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>{p.kicker}</Text>
            <Text style={styles.h1}>{p.businessName}</Text>
          </View>
          <View style={styles.metaRight}>
            <Text><Text style={styles.metaLabel}>문서번호 </Text>{p.docNo}</Text>
            <Text><Text style={styles.metaLabel}>발행일 </Text>{p.issuedAtLabel}</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.colHead}>{p.partyHead}</Text>
            <Text style={styles.partyName}>{p.partyName}</Text>
            <Text style={styles.partySub}>{p.partySub}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.colHead}>{p.detailHead}</Text>
            <Text style={styles.partySub}>{p.detailLine1}</Text>
            {p.detailLine2 && <Text style={styles.partySub}>{p.detailLine2}</Text>}
          </View>
        </View>

        <Text style={styles.sectionHead}>내역</Text>
        <View style={styles.table}>
          <View style={styles.thRow}>
            <Text style={[styles.th, { flex: 2 }]}>{p.tableHeaders[0]}</Text>
            <Text style={[styles.th, { flex: 2 }]}>{p.tableHeaders[1]}</Text>
            <Text style={[styles.th, { flex: 3 }]}>{p.tableHeaders[2]}</Text>
            <Text style={[styles.th, styles.right, { flex: 1.4 }]}>{p.tableHeaders[3]}</Text>
          </View>
          {p.items.map((it, i) => (
            <View key={i} style={styles.tr}>
              <Text style={[styles.td, { flex: 2 }]}>{it.col1}</Text>
              <Text style={[styles.td, { flex: 2 }]}>{it.col2}</Text>
              <Text style={[styles.td, { flex: 3 }]}>{it.col3}</Text>
              <Text style={[styles.td, styles.right, { flex: 1.4 }]}>{it.amount}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            {p.totalRows.map(([k, v]) => (
              <View key={k} style={styles.totalRow}>
                <Text style={styles.totalLabel}>{k}</Text>
                <Text style={styles.totalValue}>{v}</Text>
              </View>
            ))}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>{p.grandLabel}</Text>
              <Text style={styles.grandValue}>{p.grandValue}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          {p.footerLines.map((l, i) => (
            <Text key={i}>{l}</Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}
