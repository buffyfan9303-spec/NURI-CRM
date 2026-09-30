"use client";

/**
 * 호실 등록 도구: 한 칸 등록 / 엑셀 붙여넣기 일괄 등록(미리보기 → 오류 행 확인 → 등록).
 * 일괄은 서버 dry-run(bulkUnits dryRun=true)이 오류 행을 돌려주고, 오류가 0일 때만 등록 버튼이 켜진다. 등록도 서버가 다시 검사한다.
 */
import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert, SelectField, TEXTAREA, TABLE, THEAD, TH, TR, TD, CardHead } from "@/components/rental/listkit";
import { bulkUnits, createUnit } from "@/lib/domain/building-actions";
import type { UnitsBulkResult, UnitUseKind } from "@/lib/domain/building-types";
import { FW, FORM_ROW, FORM_ACTIONS, MONEY_INPUT } from "@/components/building/FieldWidths";
import { useRunAction } from "./client-common";
import { parseUnitRows, USE_KIND_LABEL } from "./unit-parse";

export function UnitTools({ businessId, buildingId }: { businessId: string; buildingId: string }) {
  const [mode, setMode] = React.useState<"none" | "one" | "bulk">("none");
  return (
    <Card className="mb-4 p-4 sm:p-5">
      <CardHead
        title="호실 등록"
        description="호실이 많으면 엑셀 표를 복사해 붙여 넣어 한 번에 등록하세요."
        action={
          <div className="flex gap-2">
            <Button type="button" variant={mode === "one" ? "primary" : "secondary"} onClick={() => setMode(mode === "one" ? "none" : "one")} aria-expanded={mode === "one"}>한 호실 추가</Button>
            <Button type="button" variant={mode === "bulk" ? "primary" : "secondary"} onClick={() => setMode(mode === "bulk" ? "none" : "bulk")} aria-expanded={mode === "bulk"}>엑셀로 한꺼번에 등록</Button>
          </div>
        }
        className="mb-0"
      />
      {mode === "one" && <OneUnit businessId={businessId} buildingId={buildingId} />}
      {mode === "bulk" && <BulkUnits businessId={businessId} buildingId={buildingId} />}
    </Card>
  );
}

function OneUnit({ businessId, buildingId }: { businessId: string; buildingId: string }) {
  const { run, pending, error } = useRunAction();
  const [f, setF] = React.useState({ dong: "", floor: "", unit_no: "", use_kind: "retail" as UnitUseKind, ex: "", co: "", share: "", weight: "1" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const n = (s: string) => (s.trim() === "" ? undefined : Number(s));
  return (
    <form className={`mt-4 ${FORM_ROW}`} onSubmit={async (e) => {
      e.preventDefault();
      const r = await run(() => createUnit(businessId, buildingId, { dong: f.dong.trim(), floor: f.floor.trim(), unit_no: f.unit_no, use_kind: f.use_kind, area_exclusive: n(f.ex), area_common: n(f.co), share: n(f.share), weight: n(f.weight) }), { success: "호실을 등록했습니다." });
      if (r.ok) setF((p) => ({ ...p, unit_no: "", ex: "", co: "", share: "" }));
    }}>
      <Input label="동" value={f.dong} onChange={set("dong")} maxLength={20} wrapperClassName={FW.short} />
      <Input label="층" value={f.floor} onChange={set("floor")} maxLength={20} wrapperClassName={FW.short} />
      <Input label="호실 번호" required value={f.unit_no} onChange={set("unit_no")} maxLength={20} wrapperClassName={FW.short} />
      <SelectField label="용도" value={f.use_kind} onChange={set("use_kind")} wrapperClassName={FW.select}>
        {(Object.keys(USE_KIND_LABEL) as UnitUseKind[]).map((k) => <option key={k} value={k}>{USE_KIND_LABEL[k]}</option>)}
      </SelectField>
      <Input label="전용면적(㎡)" type="number" step="any" min={0} value={f.ex} onChange={set("ex")} className={MONEY_INPUT} wrapperClassName={FW.short} />
      <Input label="공용면적(㎡)" type="number" step="any" min={0} value={f.co} onChange={set("co")} className={MONEY_INPUT} wrapperClassName={FW.short} />
      <Input label="지분(%)" type="number" step="any" min={0} value={f.share} onChange={set("share")} className={MONEY_INPUT} wrapperClassName={FW.short} />
      <Input label="배분 비율" hint="보통 1, 더 부담하면 2" type="number" step="any" min={0} value={f.weight} onChange={set("weight")} className={MONEY_INPUT} wrapperClassName={FW.short} />
      <div className={FORM_ACTIONS}>
        {error && <Alert kind="error" className="w-full">{error}</Alert>}
        <Button type="submit" loading={pending} disabled={!f.unit_no.trim()}>호실 등록</Button>
      </div>
    </form>
  );
}

function BulkUnits({ businessId, buildingId }: { businessId: string; buildingId: string }) {
  const { run, pending, error, setError } = useRunAction();
  const [text, setText] = React.useState("");
  const [preview, setPreview] = React.useState<UnitsBulkResult | null>(null);
  const parsed = React.useMemo(() => parseUnitRows(text), [text]);
  const localErrors = parsed.filter((p) => p.error);
  const inputs = parsed.filter((p) => !p.error).map((p) => p.input);

  async function doPreview() {
    setPreview(null);
    const r = await run(() => bulkUnits(businessId, buildingId, inputs, true), { refresh: false });
    if (r.ok) setPreview(r.data);
  }
  async function doCommit() {
    const r = await run(() => bulkUnits(businessId, buildingId, inputs, false), { success: "호실을 등록했습니다." });
    if (r.ok) { setText(""); setPreview(null); }
  }
  const serverErrors = preview?.errors ?? [];
  // 서버 행 번호는 보낸 배열 기준(1부터). 화면에는 원문 줄 번호로 바꿔 보여 준다.
  const lineOf = (row: number) => parsed.filter((p) => !p.error)[row - 1]?.line ?? row;
  return (
    <div className="mt-4 space-y-3">
      <div>
        <label htmlFor="bulk-units" className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">호실 표 붙여넣기</label>
        <p className="mb-2 text-[length:var(--fs-meta)] text-t3">열 순서: 동, 층, 호실, 용도(상가·사무실·주거·주차·공용·기타), 전용면적, 공용면적, 지분, 나누는 비율. 첫 줄이 제목 줄이면 알아서 건너뜁니다.</p>
        <textarea id="bulk-units" className={`${TEXTAREA} min-h-[160px] font-mono tabular-nums`} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setError(null); }} placeholder={"A\t3\t301\t사무실\t84.5\t30.2\t1.2\t1"} />
      </div>
      {parsed.length > 0 && (
        <p className="text-[length:var(--fs-body)] text-t2">읽은 줄 {parsed.length}줄 중 잘못된 줄 {localErrors.length}줄</p>
      )}
      {(localErrors.length > 0 || serverErrors.length > 0) && (
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead className={THEAD}><tr><th className={TH}>줄</th><th className={TH}>내용</th></tr></thead>
            <tbody>
              {localErrors.map((p) => <tr key={`l${p.line}`} className={TR}><td className={`${TD} tabular-nums`}>{p.line}</td><td className={TD}><Badge kind="error">오류</Badge> {p.error}</td></tr>)}
              {serverErrors.map((er, i) => <tr key={`s${i}`} className={TR}><td className={`${TD} tabular-nums`}>{lineOf(er.row)}</td><td className={TD}><Badge kind="error">오류</Badge> {er.message}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      {preview && serverErrors.length === 0 && localErrors.length === 0 && <Alert kind="success">확인 끝: {preview.valid}개 호실을 등록할 수 있습니다.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" loading={pending} onClick={doPreview} disabled={inputs.length === 0}>먼저 확인하기(저장 안 함)</Button>
        <Button type="button" loading={pending} onClick={doCommit} disabled={!preview || serverErrors.length > 0 || localErrors.length > 0 || preview.valid === 0}>
          {preview ? `${preview.valid}개 등록` : "등록"}
        </Button>
      </div>
      {localErrors.length > 0 && <p className="text-[length:var(--fs-meta)] text-t3">붙여 넣은 표에 잘못된 줄이 있으면 등록할 수 없습니다. 표를 수정한 뒤 다시 "먼저 확인하기"를 누르세요.</p>}
    </div>
  );
}
