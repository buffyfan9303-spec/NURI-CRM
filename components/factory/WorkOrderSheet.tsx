import {
  FACTORY_OPTION_GROUPS,
  FACTORY_QTY_FIELDS,
  fieldsByGroup,
  type OptionValue,
} from "@/lib/domain/factory-options";
import { readMaterialSelection } from "@/lib/domain/factory-materials";
import { formatKRW } from "@/lib/domain/money";
import type { FactoryOrderRow } from "@/lib/domain/factory";
import { buildJacketSpec, buildPantsSpec, buildVestSpec } from "@/lib/garment/spec";
import { GarmentPreview } from "@/components/garment/GarmentStage";
import { OrderQRCode } from "@/components/order/OrderQRCode";
import { defaultFactoryOptions } from "@/lib/domain/factory-options";
import { selectedSchematics, JACKET_SCHEMATIC_KEYS, PANTS_SCHEMATIC_KEYS, VEST_SCHEMATIC_KEYS } from "@/lib/garment/schematics";

const TYPE_LABEL: Record<string, string> = { suit: "정장", shirt: "셔츠", shoe: "구두" };

/**
 * 작업지시서(작지서) A4 인쇄 1건 — 기준본 populatePrintArea()의 항목 구성을 따른다.
 * 화면 테마와 무관하게 항상 검정 텍스트/흰 배경으로 인쇄되도록 인라인 색을 강제한다.
 * (부모의 @media print 규칙과 함께 동작 — 계약: 종이는 dark 테마와 무관하게 읽혀야 한다.)
 */
export function WorkOrderSheet({ order, businessName }: { order: FactoryOrderRow; businessName: string }) {
  const options = order.options as Record<string, OptionValue>;
  // 신규 등록/상세 수정/단건 인쇄/일괄 인쇄가 전부 이 컴포넌트 하나로 order.options를 읽으므로
  // 선택 자재가 모든 호출자에서 동일하게 나온다(요청 §11 — 별도 파라미터로 다시 넘기지 않는다).
  const materials = order.type === "suit" ? readMaterialSelection(options) : null;
  return (
    <section
      className="work-order-sheet"
      style={{ color: "#111", background: "#fff", padding: "16px 4px", fontSize: 12, lineHeight: 1.5 }}
    >
      {/* 결함 CLICK-PATH-100: 인쇄물에 주문번호 QR이 없으면 공장 스캔(resolve_scan, order_no 매칭)이
          현장에서 쓸모없다. qrcode.react SVG는 화면 테마와 무관하게 흰 배경/짙은 모듈로 고정된다. */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #111", paddingBottom: 8, marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>작업지시서 (작지서)</h1>
          <div style={{ fontSize: 12, marginTop: 4 }}>{businessName}</div>
        </div>
        <OrderQRCode orderNo={order.orderNo} size={68} />
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          <Row label="주문번호" value={order.orderNo} label2="종류" value2={TYPE_LABEL[order.type]} />
          <Row label="고객명" value={order.customerName ?? "-"} label2="상태" value2={order.status} />
          <Row label="주문일" value={order.orderDate} label2="가봉일" value2={order.fittingDate ?? "-"} />
          <Row label="납기" value={order.dueDate ?? "-"} label2="출고일" value2={order.deliveredDate ?? "-"} />
          <Row
            label="수량"
            value={FACTORY_QTY_FIELDS.map((f) => `${f.label} ${order.qty[f.key] ?? f.default}`).join(" / ")}
            label2="합계금액"
            value2={formatKRW(order.total)}
          />
          {materials && (
            <Row
              label="원단"
              value={materials.fabricLabel ?? "미등록"}
              label2="안감 / 단추"
              value2={`${materials.liningLabel ?? "미등록"} / ${materials.buttonLabel ?? "미등록"}`}
            />
          )}
        </tbody>
      </table>

      {order.type === "suit" && ((order.qty.s ?? 0) > 0 || (order.qty.p ?? 0) > 0 || (order.qty.v ?? 0) > 0) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, pageBreakInside: "avoid" }}>
          {(order.qty.s ?? 0) > 0 && (
            <div style={{ width: 140 }}>
              <div style={{ fontSize: 10, textAlign: "center", marginBottom: 2 }}>재킷 제작 도식</div>
              <GarmentPreview item="jacket" view="diagram" jacket={buildJacketSpec(options)} pants={buildPantsSpec(options)} vest={buildVestSpec(options)} fabric={null} lining={null} button={null} />
            </div>
          )}
          {(order.qty.p ?? 0) > 0 && (
            <div style={{ width: 100 }}>
              <div style={{ fontSize: 10, textAlign: "center", marginBottom: 2 }}>바지 제작 도식</div>
              <GarmentPreview item="pants" view="diagram" jacket={buildJacketSpec(options)} pants={buildPantsSpec(options)} vest={buildVestSpec(options)} fabric={null} lining={null} button={null} />
            </div>
          )}
          {(order.qty.v ?? 0) > 0 && (
            <div style={{ width: 120 }}>
              <div style={{ fontSize: 10, textAlign: "center", marginBottom: 2 }}>조끼 제작 도식</div>
              <GarmentPreview item="vest" view="diagram" jacket={buildJacketSpec(options)} pants={buildPantsSpec(options)} vest={buildVestSpec(options)} fabric={null} lining={null} button={null} />
            </div>
          )}
        </div>
      )}

      {order.type === "suit" && (() => {
        // 선택 사양 도식(아이엘 도식화) — 주문 화면의 도식 카드와 같은 대응표(lib/garment/schematics)를 읽는다.
        // 키가 빠진 옛 주문도 화면에 보이던 기본값 그대로 나오도록 기본값을 먼저 깐다.
        const o = { ...defaultFactoryOptions(), ...options } as Record<string, unknown>;
        const keys = [
          ...((order.qty.s ?? 0) > 0 ? JACKET_SCHEMATIC_KEYS : []),
          ...((order.qty.s ?? 0) > 0 || (order.qty.p ?? 0) > 0 ? PANTS_SCHEMATIC_KEYS : []),
          ...((order.qty.v ?? 0) > 0 ? VEST_SCHEMATIC_KEYS : []),
        ];
        const list = selectedSchematics(o, keys);
        if (!list.length) return null;
        return (
          <div style={{ marginBottom: 10, pageBreakInside: "avoid" }}>
            <div style={{ fontWeight: 700, background: "#eee", padding: "2px 6px", fontSize: 11 }}>선택 사양 도식</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4, marginTop: 4 }}>
              {list.map(({ key, s: sc }) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={key} src={sc.src} alt={sc.label} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", border: "1px solid #ccc" }} />
              ))}
            </div>
          </div>
        );
      })()}

      {order.type === "suit" ? (
        FACTORY_OPTION_GROUPS.filter((g) => g !== "일정/수량").map((g) => (
          <div key={g} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700, background: "#eee", padding: "2px 6px", fontSize: 11 }}>{g}</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {chunk(fieldsByGroup(g), 3).map((row, i) => (
                  <tr key={i}>
                    {row.map((f) => {
                      const v = options[f.key];
                      const display =
                        f.kind === "pad"
                          ? `${(v as { L?: number })?.L ?? f.default.L}/${(v as { R?: number })?.R ?? f.default.R}${f.unit}`
                          : String(v ?? f.default);
                      return (
                        <td key={f.key} style={{ border: "1px solid #ccc", padding: "2px 5px", fontSize: 10.5 }}>
                          <b>{f.label}</b>: {display}
                        </td>
                      );
                    })}
                    {Array.from({ length: 3 - row.length }).map((_, j) => (
                      <td key={`pad-${j}`} style={{ border: "1px solid #ccc" }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      ) : (
        <p style={{ fontSize: 11, color: "#555" }}>옵션 항목은 정장만 지원합니다(셔츠/구두는 수량·일정만 관리).</p>
      )}

      {order.memo && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          <b>메모</b>: {order.memo}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 24, fontSize: 11 }}>
        <div>재단 확인: ______</div>
        <div>봉제 확인: ______</div>
        <div>검수 확인: ______</div>
      </div>
    </section>
  );
}

function Row({ label, value, label2, value2 }: { label: string; value: string; label2: string; value2: string }) {
  const cell: React.CSSProperties = { border: "1px solid #ccc", padding: "3px 6px" };
  const labelCell: React.CSSProperties = { ...cell, background: "#f5f5f5", fontWeight: 700, width: "12%" };
  return (
    <tr>
      <td style={labelCell}>{label}</td>
      <td style={cell}>{value}</td>
      <td style={labelCell}>{label2}</td>
      <td style={cell}>{value2}</td>
    </tr>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
