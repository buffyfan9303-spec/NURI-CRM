"use client";

import * as React from "react";
import { Undo2, Redo2, Columns2, X } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import {
  FACTORY_OPTION_GROUPS, fieldsByGroup, FACTORY_QTY_FIELDS, type OptionValue, type FactoryOptionGroup,
} from "@/lib/domain/factory-options";
import type { MaterialOption } from "@/lib/domain/factory-types";
import { readMaterialSelection, type MaterialSelection } from "@/lib/domain/factory-materials";
import { buildJacketSpec, buildPantsSpec, buildVestSpec, resolveComboCorrections } from "@/lib/garment/spec";
import { GarmentStage, BACK_ONLY_KEYS, type GarmentItem } from "./GarmentStage";
import type { GarmentView } from "./JacketSvg";
import { FabricGrid } from "./FabricGrid";
import { OptionTabs } from "@/components/factory/OptionTabs";
import { schematicFor } from "@/lib/garment/schematics";
import { lapelPaths, pocketPaths } from "./shapes";

const FIELD_GROUP: Record<string, FactoryOptionGroup> = {};
for (const g of FACTORY_OPTION_GROUPS) for (const f of fieldsByGroup(g)) FIELD_GROUP[f.key] = g;

const BACK_LABEL: Record<string, string> = {
  vent: "뒷트임", vCut: "V 트임", botBackP: "뒷주머니", vestBack: "조끼 등판",
};

function useElementWidth<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

type Snapshot = { options: Record<string, OptionValue>; qty: Record<string, number>; materials: MaterialSelection };

/** shapes.ts의 실제 렌더 부품을 그대로 축소해 쓰는 미니 아이콘 — 의미 없는 옷 아이콘 반복 대신. */
function MiniLapelIcon({ kind }: { kind: string }) {
  const lp = lapelPaths(kind, 16);
  return (
    <svg viewBox="60 40 80 90" width={24} height={24} aria-hidden>
      <path d={lp.collar} fill="#c7ccd3" stroke="#333" strokeWidth={1.4} />
      <path d={lp.facing} fill="#dfe3e6" stroke="#333" strokeWidth={1} />
      {lp.notchOrPeak && <path d={lp.notchOrPeak} fill="#fff" stroke="#333" strokeWidth={1} />}
    </svg>
  );
}
function MiniVentIcon({ kind }: { kind: string }) {
  return (
    <svg viewBox="60 220 80 56" width={24} height={17} aria-hidden>
      <rect x={62} y={222} width={76} height={52} fill="#dfe3e6" stroke="#333" strokeWidth={1.2} />
      {kind === "센터벤트" && <line x1={100} y1={224} x2={100} y2={272} stroke="#333" />}
      {kind === "사이드벤트" && (<><line x1={80} y1={224} x2={80} y2={272} stroke="#333" /><line x1={120} y1={224} x2={120} y2={272} stroke="#333" /></>)}
    </svg>
  );
}
function MiniPocketIcon({ shape }: { shape: string }) {
  return (
    <svg viewBox="55 200 90 40" width={26} height={12} aria-hidden>
      <path d={pocketPaths(shape, true, "정각")} fill="none" stroke="#333" strokeWidth={1.6} />
    </svg>
  );
}
function MiniDesignIcon({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 40 24" width={22} height={13} aria-hidden>
      {kind === "싱글"
        ? <circle cx={20} cy={12} r={3} fill="#333" />
        : (<><circle cx={14} cy={12} r={3} fill="#333" /><circle cx={26} cy={12} r={3} fill="#333" /></>)}
    </svg>
  );
}

function VisualPicker({
  label, value, choices, onChange, icon, schematicKey, options,
}: {
  label: string; value: string; choices: string[]; onChange: (v: string) => void;
  icon?: (c: string) => React.ReactNode;
  /** 아이엘 도식화 대응 키 — 있으면 그 선택지의 도식 이미지를 아이콘 대신 보여준다(lib/garment/schematics). */
  schematicKey?: string;
  options?: Record<string, unknown>;
}) {
  const withImg = !!schematicKey;
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-medium text-t3">{label}</div>
      <div className={withImg ? "grid grid-cols-[repeat(auto-fill,minmax(62px,1fr))] gap-1.5" : "flex flex-wrap gap-1.5"}>
        {choices.map((c) => {
          const sc = schematicKey ? schematicFor(schematicKey, c, options) : undefined;
          const on = value === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              title={c}
              onClick={() => onChange(c)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-[6px] border-2 text-[10px] leading-tight",
                withImg ? "p-0.5" : "px-1.5 py-1",
                on ? "border-[var(--accent)] text-t" : "border-[var(--bd)] text-t2 hover:border-[var(--bd2)]"
              )}
            >
              {sc ? (
                // 도식 원본(500×500)의 아래 글자띠는 잘라내고 그림 부분만 보인다 — 이름은 아래 span 이 표시.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sc.src} alt="" className="aspect-square w-full rounded-[4px] bg-white object-cover object-top" style={{ clipPath: "inset(0 0 10% 0)" }} />
              ) : withImg ? (
                <span className="flex aspect-square w-full items-center justify-center rounded-[4px] bg-sf2 text-[9.5px] text-t3">
                  {icon ? icon(c) : "도식 없음"}
                </span>
              ) : (
                icon?.(c)
              )}
              <span className="w-full truncate px-0.5 text-center">{c}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 공장 주문 원단·디자인 워크스페이스 — OrderForm(신규)과 OrderDetail(수정)이 공유한다.
 * options/qty/materials는 부모가 소유한 단일 초안 state이고(요청 §8), 이 컴포넌트는
 * OptionTabs와 같은 (key, value) 계약으로만 통신한다 — 부모 코드를 바꾸지 않고도
 * 여밈↔단추 조합 보정처럼 여러 키를 한 번에 갱신할 수 있다(React 함수형 setState가
 * 같은 배치 안에서 순서대로 병합되기 때문).
 */
export function GarmentWorkspace({
  options, qty, materials,
  onOptionsChange, onQtyChange, onMaterialsChange,
  fabrics, linings, buttons,
  serverOptions, serverQty,
}: {
  options: Record<string, OptionValue>;
  qty: Record<string, number>;
  materials: MaterialSelection;
  onOptionsChange: (key: string, value: unknown) => void;
  onQtyChange: (key: string, value: number) => void;
  onMaterialsChange: (sel: MaterialSelection) => void;
  fabrics: MaterialOption[];
  linings: MaterialOption[];
  buttons: MaterialOption[];
  /** 서버 확정본(있으면) — "마지막 확정본으로 되돌리기"에 쓴다. 없으면(신규 주문) 되돌리기 비활성. */
  serverOptions?: Record<string, OptionValue>;
  serverQty?: Record<string, number>;
}) {
  const [item, setItem] = React.useState<GarmentItem>("jacket");
  const [view, setView] = React.useState<GarmentView>("front");
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [notices, setNotices] = React.useState<string[]>([]);
  const [backNotice, setBackNotice] = React.useState<{ key: string; label: string } | null>(null);
  const [compareB, setCompareB] = React.useState<Snapshot | null>(null);

  const history = React.useRef<Snapshot[]>([{ options, qty, materials }]);
  const historyIndex = React.useRef(0);
  const lastPush = React.useRef(Date.now());
  const applyingHistory = React.useRef(false);

  const applySnapshot = React.useCallback((snap: Snapshot) => {
    applyingHistory.current = true;
    for (const [k, v] of Object.entries(snap.options)) onOptionsChange(k, v);
    for (const [k, v] of Object.entries(snap.qty)) onQtyChange(k, v);
    onMaterialsChange(snap.materials);
  }, [onOptionsChange, onQtyChange, onMaterialsChange]);

  React.useEffect(() => {
    if (applyingHistory.current) { applyingHistory.current = false; return; }
    const now = Date.now();
    if (now - lastPush.current < 250) return; // 연속 입력 중 매 렌더 push 방지(적당한 디바운스)
    lastPush.current = now;
    const snap: Snapshot = { options, qty, materials };
    const trimmed = history.current.slice(0, historyIndex.current + 1);
    trimmed.push(snap);
    history.current = trimmed.slice(-20); // 상한 20 — "적당한 상한의 로컬 이력"
    historyIndex.current = history.current.length - 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options), JSON.stringify(qty), JSON.stringify(materials)]);

  const undo = () => {
    if (historyIndex.current <= 0) return;
    historyIndex.current -= 1;
    applySnapshot(history.current[historyIndex.current]);
  };
  const redo = () => {
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current += 1;
    applySnapshot(history.current[historyIndex.current]);
  };
  const revertToConfirmed = () => {
    if (!serverOptions || !serverQty) return;
    applySnapshot({ options: serverOptions, qty: serverQty, materials: readMaterialSelection(serverOptions) });
  };

  const handleOptionChange = (key: string, value: unknown) => {
    onOptionsChange(key, value);
    if (key === "design" || key === "btnN") {
      const merged = { ...options, [key]: value as OptionValue };
      const { changes } = resolveComboCorrections(merged);
      for (const c of changes) { onOptionsChange(c.key, c.to); }
      if (changes.length) setNotices((n) => [...changes.map((c) => c.reason), ...n].slice(0, 5));
    }
    if (key === "vestFasten" || key === "vestBtnN") {
      const merged = { ...options, [key]: value as OptionValue };
      const { changes } = resolveComboCorrections(merged);
      for (const c of changes) { onOptionsChange(c.key, c.to); }
      if (changes.length) setNotices((n) => [...changes.map((c) => c.reason), ...n].slice(0, 5));
    }
    if (BACK_ONLY_KEYS.has(key) && view !== "back") {
      setBackNotice({ key, label: BACK_LABEL[key] ?? key });
    }
  };

  const focusField = (key: string) => {
    const group = FIELD_GROUP[key];
    if (group) setActiveGroup(group);
    window.requestAnimationFrame(() => {
      const el = document.getElementById(key) ?? document.getElementById(`${key}-L`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el as HTMLElement | null)?.focus?.();
    });
  };
  const [activeGroup, setActiveGroup] = React.useState<FactoryOptionGroup>("상의");

  const jacketSpec = React.useMemo(() => buildJacketSpec(options), [options]);
  const pantsSpec = React.useMemo(() => buildPantsSpec(options), [options]);
  const vestSpec = React.useMemo(() => buildVestSpec(options), [options]);

  const fabricMat = fabrics.find((f) => f.id === materials.fabricId) ?? null;
  const liningMat = linings.find((f) => f.id === materials.liningId) ?? null;
  const buttonMat = buttons.find((f) => f.id === materials.buttonId) ?? null;

  const pickMaterial = (kind: "fabric" | "lining" | "button", id: string) => {
    const list = kind === "fabric" ? fabrics : kind === "lining" ? linings : buttons;
    const m = list.find((x) => x.id === id) ?? null;
    const label = m ? `${m.code} · ${m.name}` : null;
    onMaterialsChange({
      ...materials,
      ...(kind === "fabric" ? { fabricId: id || null, fabricLabel: label } : {}),
      ...(kind === "lining" ? { liningId: id || null, liningLabel: label } : {}),
      ...(kind === "button" ? { buttonId: id || null, buttonLabel: label } : {}),
    });
  };

  const threeCol = width >= 1120;
  const twoCol = !threeCol && width >= 760;

  const itemTabs: { key: GarmentItem; label: string; count: number }[] = [
    { key: "jacket", label: "재킷", count: qty.s ?? 0 },
    { key: "pants", label: "바지", count: qty.p ?? 0 },
    { key: "vest", label: "조끼", count: qty.v ?? 0 },
    { key: "coat", label: "코트", count: qty.c ?? 0 },
  ];

  const compareSnapshot = () => setCompareB({ options: { ...options }, qty: { ...qty }, materials: { ...materials } });
  const applyCompareB = () => { if (compareB) applySnapshot(compareB); setCompareB(null); };

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {itemTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setItem(t.key)}
              className={cn(
                "min-h-[36px] rounded-[var(--r-md)] border px-3 text-[12.5px] font-medium",
                item === t.key ? "border-[var(--accent)] bg-[var(--accent)]/10 text-t" : "border-[var(--bd)] text-t2"
              )}
            >
              {t.label} {t.count}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={undo} disabled={historyIndex.current <= 0} className="flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-[11.5px] text-t2 hover:bg-sf2 disabled:opacity-40">
            <Undo2 size={14} />되돌리기
          </button>
          <button type="button" onClick={redo} disabled={historyIndex.current >= history.current.length - 1} className="flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-[11.5px] text-t2 hover:bg-sf2 disabled:opacity-40">
            <Redo2 size={14} />다시적용
          </button>
          {serverOptions && (
            <button type="button" onClick={revertToConfirmed} className="rounded-[6px] px-2 py-1.5 text-[11.5px] text-t2 hover:bg-sf2">확정본으로</button>
          )}
          {!compareB ? (
            <button type="button" onClick={compareSnapshot} className="flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-[11.5px] text-t2 hover:bg-sf2">
              <Columns2 size={14} />비교(B) 저장
            </button>
          ) : (
            <>
              <button type="button" onClick={applyCompareB} className="rounded-[6px] px-2 py-1.5 text-[11.5px] font-semibold text-[var(--accent-ink)] hover:bg-sf2">B 적용</button>
              <button type="button" onClick={() => setCompareB(null)} aria-label="비교 닫기" className="rounded-[6px] p-1.5 text-t3 hover:bg-sf2"><X size={14} /></button>
            </>
          )}
        </div>
      </div>

      {notices.length > 0 && (
        <div className="flex flex-col gap-1 rounded-[var(--r-md)] bg-eb px-3 py-2 text-[12px] text-et">
          {notices.slice(0, 3).map((msg, i) => <div key={i}>{msg}</div>)}
        </div>
      )}

      <div className={cn("grid gap-3", threeCol ? "grid-cols-[300px_1fr_280px]" : twoCol ? "grid-cols-[280px_1fr]" : "grid-cols-1")}>
        {/* 태블릿 세로/모바일(1열 스택)에서는 미리보기를 옵션보다 먼저 보여준다(요청 §6:
            "위 미리보기 / 아래 옵션"). 3열/2열 배치에서는 원래 좌→중→우 DOM 순서를 유지한다. */}
        <div className={cn("flex flex-col gap-4 rounded-[var(--r-lg)] border border-[var(--bd)] p-3", !threeCol && !twoCol && "order-2")}>
          <FabricGrid kind="fabric" label="원단" options={fabrics} value={materials.fabricId ?? ""} onChange={(id) => pickMaterial("fabric", id)} />
          <FabricGrid kind="lining" label="안감" options={linings} value={materials.liningId ?? ""} onChange={(id) => pickMaterial("lining", id)} />
          <FabricGrid kind="button" label="단추" options={buttons} value={materials.buttonId ?? ""} onChange={(id) => pickMaterial("button", id)} />

          {item === "jacket" && (
            <div className="border-t border-[var(--bd)] pt-3">
              <VisualPicker label="여밈" value={String(options.design ?? "싱글")} choices={["싱글", "더블"]} onChange={(v) => handleOptionChange("design", v)} icon={(c) => <MiniDesignIcon kind={c} />} />
              {/* 앞단추는 여밈에 맞는 선택지만 보여준다(싱글 1·2·3 / 더블 4·6) — 도식도 여밈과 조합해 정해진다. */}
              <VisualPicker label="앞단추" value={String(options.btnN ?? "2")} choices={String(options.design ?? "싱글") === "더블" ? ["4", "6"] : ["1", "2", "2/3", "3"]} onChange={(v) => handleOptionChange("btnN", v)} schematicKey="btnN" options={options} />
              <VisualPicker label="라펠 모양" value={String(options.lapel ?? "노치드")} choices={["노치드", "피크드", "숄", "기타"]} onChange={(v) => handleOptionChange("lapel", v)} icon={(c) => <MiniLapelIcon kind={c} />} schematicKey="lapel" />
              <VisualPicker label="라펠 디테일" value={String(options.lapelDet ?? "없음")} choices={["없음", "큐큐(플라워홀)", "쎄빠"]} onChange={(v) => handleOptionChange("lapelDet", v)} schematicKey="lapelDet" />
              <VisualPicker label="뒷트임" value={String(options.vent ?? "사이드벤트")} choices={["사이드벤트", "센터벤트", "통막음"]} onChange={(v) => handleOptionChange("vent", v)} icon={(c) => <MiniVentIcon kind={c} />} schematicKey="vent" />
              <VisualPicker label="소매 밑단" value={String(options.cuff ?? "없음")} choices={["없음", "일자", "겹침", "홍아개", "쎄빠"]} onChange={(v) => handleOptionChange("cuff", v)} schematicKey="cuff" />
              <VisualPicker label="안감" value={String(options.lining ?? "전체")} choices={["전체", "반안감", "갈매기반안감", "언컨(제원단)", "언컨(안감)"]} onChange={(v) => handleOptionChange("lining", v)} schematicKey="lining" />
              <VisualPicker label="학고(주머니 외곽)" value={String(options.hak ?? "일반")} choices={["일반", "바르카", "아웃포켓", "라운드아웃"]} onChange={(v) => handleOptionChange("hak", v)} icon={(c) => <MiniPocketIcon shape={c} />} />
            </div>
          )}
          {item === "pants" && (
            <div className="border-t border-[var(--bd)] pt-3">
              <VisualPicker label="앞 주머니" value={String(options.botFrontP ?? "사이드")} choices={["사이드", "슬랜티드", "입술", "크로스", "없음"]} onChange={(v) => handleOptionChange("botFrontP", v)} schematicKey="botFrontP" />
              <VisualPicker label="앞 주름" value={String(options.botTuck ?? "0")} choices={["0", "1", "1(역주름)", "2", "2(역주름)"]} onChange={(v) => handleOptionChange("botTuck", v)} schematicKey="botTuck" />
              <VisualPicker label="뒷 주머니" value={String(options.botBackP ?? "양쪽-입술")} choices={["양쪽-입술", "양쪽-단추", "양쪽-후다", "한쪽", "없음"]} onChange={(v) => handleOptionChange("botBackP", v)} schematicKey="botBackP" />
              <VisualPicker label="밑단" value={String(options.botHem ?? "기본")} choices={["기본", "턴업", "카브라", "모닝컷"]} onChange={(v) => handleOptionChange("botHem", v)} schematicKey="botHem" />
              <VisualPicker label="사이드 어드저스트" value={String(options.sas ?? "없음")} choices={["없음", "있음"]} onChange={(v) => handleOptionChange("sas", v)} schematicKey="sas" />
            </div>
          )}
          {item === "vest" && (
            <div className="border-t border-[var(--bd)] pt-3">
              <VisualPicker label="조끼 여밈" value={String(options.vestFasten ?? "싱글")} choices={["싱글", "더블", "싱글(밑단 일자)", "더블(밑단 일자)"]} onChange={(v) => handleOptionChange("vestFasten", v)} schematicKey="vestFasten" />
              <VisualPicker label="조끼 라펠" value={String(options.vestLapel ?? "없음")} choices={["없음", "노치드", "피크드"]} onChange={(v) => handleOptionChange("vestLapel", v)} icon={(c) => <MiniLapelIcon kind={c === "없음" ? "기타" : c} />} />
            </div>
          )}

          <div className="border-t border-[var(--bd)] pt-3">
            <div className="mb-1 text-[11px] font-medium text-t3">세부 사양(41항목)</div>
            <OptionTabs
              options={options}
              qty={qty}
              onOptionsChange={handleOptionChange}
              onQtyChange={onQtyChange}
              activeGroup={activeGroup}
              onActiveGroupChange={setActiveGroup}
            />
          </div>
        </div>

        <div className={cn("rounded-[var(--r-lg)] border border-[var(--bd)] p-3", !threeCol && !twoCol && "order-1")}>
          {compareB ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-center text-[11px] font-semibold text-t3">A (현재)</div>
                <GarmentStage
                  item={item} view={view} onViewChange={setView}
                  jacket={jacketSpec} pants={pantsSpec} vest={vestSpec}
                  fabric={fabricMat} lining={liningMat} button={buttonMat}
                  onFocusField={focusField} backNotice={null} onDismissBackNotice={() => {}}
                />
              </div>
              <div>
                <div className="mb-1 text-center text-[11px] font-semibold text-t3">B (비교 저장본)</div>
                <GarmentStage
                  item={item} view={view} onViewChange={setView}
                  jacket={buildJacketSpec(compareB.options)} pants={buildPantsSpec(compareB.options)} vest={buildVestSpec(compareB.options)}
                  fabric={fabrics.find((f) => f.id === compareB.materials.fabricId) ?? null}
                  lining={linings.find((f) => f.id === compareB.materials.liningId) ?? null}
                  button={buttons.find((f) => f.id === compareB.materials.buttonId) ?? null}
                  onFocusField={() => {}} backNotice={null} onDismissBackNotice={() => {}}
                />
              </div>
            </div>
          ) : (
            <GarmentStage
              item={item} view={view} onViewChange={setView}
              jacket={jacketSpec} pants={pantsSpec} vest={vestSpec}
              fabric={fabricMat} lining={liningMat} button={buttonMat}
              onFocusField={focusField}
              backNotice={backNotice}
              onDismissBackNotice={() => setBackNotice(null)}
              compactVh={!threeCol && !twoCol ? 40 : undefined}
            />
          )}
        </div>

        <div className={cn("rounded-[var(--r-lg)] border border-[var(--bd)] p-3", !threeCol && "order-last")}>
          <h4 className="mb-2 text-[12.5px] font-semibold text-t">현재 제작 사양</h4>
          <div className="mb-2 flex flex-col gap-1 text-[12px]">
            <div><span className="text-t3">원단: </span>{materials.fabricLabel ?? <span className="text-wt">미선택</span>}</div>
            <div><span className="text-t3">안감: </span>{materials.liningLabel ?? <span className="text-wt">미선택</span>}</div>
            <div><span className="text-t3">단추: </span>{materials.buttonLabel ?? <span className="text-wt">미선택</span>}</div>
          </div>
          <details open={threeCol} className="text-[12px]">
            <summary className="cursor-pointer select-none text-t2">41항목 전체 보기</summary>
            <div className="mt-2 grid grid-cols-1 gap-y-1">
              {FACTORY_QTY_FIELDS.map((f) => (
                <div key={f.key}><span className="text-t3">{f.label}: </span><span className="text-t">{qty[f.key] ?? f.default}</span></div>
              ))}
              {FACTORY_OPTION_GROUPS.filter((g) => g !== "일정/수량").map((g) => (
                <div key={g} className="mt-1">
                  <div className="text-[10.5px] font-semibold text-t3">{g}</div>
                  {fieldsByGroup(g).map((f) => {
                    const v = options[f.key];
                    const display = f.kind === "pad"
                      ? `${(v as { L?: number })?.L ?? f.default.L}/${(v as { R?: number })?.R ?? f.default.R}${f.unit}`
                      : String(v ?? f.default);
                    return <div key={f.key}><span className="text-t3">{f.label}: </span><span className="text-t">{display}</span></div>;
                  })}
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
