# -*- coding: utf-8 -*-
"""
건물 관리비 원본 엑셀(26년 06/07/08월 관리비.xlsx) → 0031 스키마 입력 JSON + 대조표. 읽기 전용(원본은 절대 쓰지 않는다).
  실행: py -3.12 scripts/import-building-excel.py [--src <폴더>] [--out <폴더>]
  기본 src = C:\\Users\\buffy\\OneDrive\\바탕 화면\\개인 프로젝트\\관리비 파일, out = 세션 scratchpad\\cam-db(없으면 --out 필수)
  출력: <out>\\building-import.json (호실·임차인·사업자번호·월별 원천·호실별 청구 — PII 포함, scratchpad 밖으로 옮기지 않는다)
        표준출력에는 건수·합계·차이만 찍는다(호실·이름·번호 출력 금지).
  DB 삽입은 insert_into_db(payload, admin_url, service_key) 함수로만 하고 이 파일은 실행하지 않는다(메인이 사용자 확인 후 호출).

원본 '품목' 시트 구조(헤더 실측): 4~30행 = 27호실. 열 J 평형·K ㎡·L 일반관리비(=평형×J2 단가, VAT 포함)·M~R 법정관리(원천/J45 합×평형)
  S 관리비부가세·T 법정부가세·U 법정관리 합(L~R)·V~Z 검사비(AA 합)·AC~AQ 기타관리비(AS 합, AR 선납금 차감)·AT/AU 전기 전월·당월 지침·AV 사용량
  AW 사용요금·AX 공용요금·AY 전기기본료·AZ 전력기금·BA T.V·BB 전기부가세·BC 전기합계·BD 수도공용·BE/BF 수도 지침·BG 사용량·BH 사용요금·BI 수도합계
  BJ 미납액 합계·BK 미납연체료합계·BL 당월부과액(=U+AA+AB+AS+BC+BI)·BM 당월연체료(=BL×3% — 계약 미승인, 가져오지 않음)·BQ 총납기후금액
원본 월합계(설계서 20.7 기준) 6월 5,913,581 / 7월 6,051,665 / 8월 7,405,785(81건) — BL 반올림 합으로 대조한다.
"""
import argparse, json, os, sys, hashlib
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

try:
    from openpyxl import load_workbook
    from openpyxl.utils import column_index_from_string as ci
except ImportError:
    print("openpyxl 이 없습니다. py -3.12 로 실행하세요.", file=sys.stderr); sys.exit(2)

EXPECTED = {"2026-06": 5_913_581, "2026-07": 6_051_665, "2026-08": 7_405_785}
STD = {  # 원본 열 → (항목명, 표준분류, 과세, 배분식) — 세무 분류는 세무사 확정 전 '미승인'으로 넣는다
    "L": ("일반관리비", "general", "taxable", "area"),
    "M": ("승강기유지비", "elevator", "exempt", "area"),
    "N": ("전기관리", "general", "exempt", "area"),
    "O": ("법정관리(기타1)", "general", "exempt", "area"),
    "P": ("방화관리", "security", "exempt", "area"),
    "Q": ("법정관리(기타2)", "general", "exempt", "area"),
    "R": ("법정관리(기타3)", "general", "exempt", "area"),
    "AA": ("검사비", "repair", "exempt", "area"),
    "AS": ("기타관리비", "other", "exempt", "direct"),
    "BC": ("전기료", "electric", "pass_through", "direct"),
    "BI": ("수도료", "water", "pass_through", "direct"),
}

def won(v):
    if v is None or v == "": return 0
    return int(Decimal(str(v)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

def num(v):
    try: return float(v) if v not in (None, "") else None
    except Exception: return None

def read_month(path: Path, period: str):
    wb = load_workbook(path, read_only=True, data_only=True)
    s = wb["품목"]
    units, charges, meters, totals_by_col = [], [], [], {}
    for r in range(4, 31):
        no = s.cell(r, ci("I")).value
        if no in (None, ""): continue
        unit_no = str(no).strip()
        rec = {
            "row": r, "unit_no": unit_no, "floor": str(s.cell(r, ci("H")).value or "").strip() or None,
            "tenant": {"name": str(s.cell(r, ci("B")).value or "").strip(), "biz_reg_no": str(s.cell(r, ci("C")).value or "").replace("-", "").strip() or None,
                       "ceo": str(s.cell(r, ci("D")).value or "").strip() or None, "address": str(s.cell(r, ci("E")).value or "").strip() or None,
                       "biz_type": str(s.cell(r, ci("F")).value or "").strip() or None, "biz_item": str(s.cell(r, ci("G")).value or "").strip() or None},
            "area_pyeong": num(s.cell(r, ci("J")).value), "area_m2": num(s.cell(r, ci("K")).value),
            "lines": {col: won(s.cell(r, ci(col)).value) for col in STD},
            "vat": {"mgmt": won(s.cell(r, ci("S")).value), "legal": won(s.cell(r, ci("T")).value), "electric": won(s.cell(r, ci("BB")).value)},
            "prepaid": won(s.cell(r, ci("AR")).value),
            "prior_unpaid": won(s.cell(r, ci("BJ")).value), "prior_late": won(s.cell(r, ci("BK")).value),
            "current_charge": won(s.cell(r, ci("BL")).value),   # 원본 당월부과액(반올림)
            "current_charge_raw": num(s.cell(r, ci("BL")).value),
            "late_3pct_original": won(s.cell(r, ci("BM")).value),  # 원본 수식 3% — 가져오지 않음(계약 승인 전)
        }
        for col in STD: totals_by_col[col] = totals_by_col.get(col, 0) + rec["lines"][col]
        units.append(rec)
        meters.append({"unit_no": unit_no, "electric": {"prev": num(s.cell(r, ci("AT")).value), "curr": num(s.cell(r, ci("AU")).value), "usage": num(s.cell(r, ci("AV")).value)},
                       "water": {"prev": num(s.cell(r, ci("BE")).value), "curr": num(s.cell(r, ci("BF")).value), "usage": num(s.cell(r, ci("BG")).value)}})
    rate_per_pyeong = num(s.cell(2, ci("J")).value)
    due = s.cell(2, ci("F")).value
    wb.close()
    return {"period": period, "file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "rate_per_pyeong": rate_per_pyeong,
            "due_note": str(due) if due is not None else None, "units": units, "meters": meters, "totals_by_col": totals_by_col,
            "charge_types": [{"col": c, "name": n, "std_category": sc, "tax_treatment": tx, "alloc_method": am, "tax_approved": False} for c, (n, sc, tx, am) in STD.items()]}

def reconcile(month):
    rounded = sum(u["current_charge"] for u in month["units"])
    raw = sum(u["current_charge_raw"] or 0 for u in month["units"])
    line_sum = sum(sum(u["lines"].values()) for u in month["units"])
    exp = EXPECTED.get(month["period"])
    return {"period": month["period"], "units": len(month["units"]), "expected": exp, "sum_rounded_BL": rounded, "sum_raw_BL": round(raw, 2),
            "sum_of_lines": line_sum, "diff_expected_vs_rounded": (rounded - exp) if exp is not None else None,
            "diff_lines_vs_rounded": line_sum - rounded,
            "cause": "원본 BL 은 소수(면적 비례 원액)를 셀마다 반올림 표시 — 호실별 반올림 합과 원액 합의 차이. DB 는 최대잉여법으로 원천=배분 0원 강제",
            "late_fee_original_sum_skipped": sum(u["late_3pct_original"] for u in month["units"])}

def build_payload(months):
    first = months[0]
    unit_nos = sorted({u["unit_no"] for m in months for u in m["units"]})
    parties = {}
    for m in months:
        for u in m["units"]:
            key = u["tenant"]["biz_reg_no"] or u["tenant"]["name"]
            if key and key not in parties: parties[key] = u["tenant"] | {"kind": "corp" if u["tenant"]["biz_reg_no"] else "person"}
    return {
        "building": {"name": "실데이터 빌딩", "kind": "commercial", "due_day": 20, "note": "원본 3개월 엑셀에서 생성(중립 이름). 공급자 사업자번호는 원본 9자리 기록 — 10자리 확인 전 미입력"},
        "units": [{"unit_no": n, "floor": next((u["floor"] for u in first["units"] if u["unit_no"] == n), None),
                   "area_exclusive": next((u["area_m2"] for m in months for u in m["units"] if u["unit_no"] == n), 0) or 0,
                   "weight": next((u["area_pyeong"] for m in months for u in m["units"] if u["unit_no"] == n), 0) or 0} for n in unit_nos],
        "parties": list(parties.values()),
        "contracts": [{"unit_no": u["unit_no"], "tenant_key": u["tenant"]["biz_reg_no"] or u["tenant"]["name"], "from": "2026-06-01", "late_terms": None} for u in first["units"]],
        "charge_types": first["charge_types"],
        "months": [{"period": m["period"], "file": m["file"], "sha256": m["sha256"], "rate_per_pyeong": m["rate_per_pyeong"],
                    "sources": m["totals_by_col"], "bills": [{"unit_no": u["unit_no"], "lines": u["lines"], "vat": u["vat"], "prepaid": u["prepaid"],
                    "prior_unpaid": u["prior_unpaid"], "current_charge": u["current_charge"]} for u in m["units"]],
                    "meters": m["meters"]} for m in months],
        "reconcile": [reconcile(m) for m in months],
    }

def insert_into_db(payload, supabase_url, service_role_key, business_id, owner_user_id):
    """service_role 로 기준정보·원천을 넣는다(메인이 사용자 확인 후 호출). 청구 확정은 넣지 않는다 — bld_calculate/bld_approve 가 실제 사용자 세션으로 계산·승인해야 한다.
    반환: 만든 building_id 와 건수. 네트워크 호출은 requests 가 필요하다(없으면 ImportError)."""
    import requests  # noqa: WPS433
    h = {"apikey": service_role_key, "Authorization": f"Bearer {service_role_key}", "Content-Type": "application/json", "Accept-Profile": "crm", "Content-Profile": "crm", "Prefer": "return=representation,missing=default"}  # 다행 insert 에서 빠진 열을 null 이 아니라 DB 기본값으로
    def post(table, rows):
        r = requests.post(f"{supabase_url}/rest/v1/{table}", headers=h, data=json.dumps(rows), timeout=60); r.raise_for_status(); return r.json()
    b = post("bld_buildings", [{"business_id": business_id, "name": payload["building"]["name"], "kind": "commercial", "due_day": payload["building"]["due_day"]}])[0]
    bid = b["id"]
    units = post("bld_units", [{"business_id": business_id, "building_id": bid, "unit_no": u["unit_no"], "floor": u["floor"], "area_exclusive": u["area_exclusive"], "weight": u["weight"], "valid": "[2026-06-01,)"} for u in payload["units"]])
    uid = {u["unit_no"]: u["id"] for u in units}
    parties = post("bld_parties", [{"business_id": business_id, "kind": p["kind"], "name": p["name"], "biz_reg_no": p["biz_reg_no"] if p["biz_reg_no"] and len(p["biz_reg_no"]) == 10 else None,
                                    "ceo_name": p["ceo"], "address": p["address"], "biz_type": p["biz_type"], "biz_item": p["biz_item"], "memo": None if (p["biz_reg_no"] and len(p["biz_reg_no"]) == 10) else f"원본 사업자번호 자리수 {len(p['biz_reg_no'] or '')} — 확인 필요"} for p in payload["parties"]])
    pid = {(p["biz_reg_no"] or p["name"]): p["id"] for p in parties}
    post("bld_contracts", [{"business_id": business_id, "building_id": bid, "unit_id": uid[c["unit_no"]], "tenant_party_id": pid[c["tenant_key"]], "period": f"[{c['from']},)", "created_by": owner_user_id} for c in payload["contracts"]])
    cts = post("bld_charge_types", [{"business_id": business_id, "building_id": bid, "name": c["name"], "std_category": c["std_category"], "tax_treatment": c["tax_treatment"],
                                     "source_kind": "expense" if c["alloc_method"] == "area" else "direct", "alloc_method": c["alloc_method"] if c["alloc_method"] != "area" else "weight",
                                     "rate_includes_vat": c["tax_treatment"] == "taxable", "valid": "[2026-06-01,)", "sort_order": i, "created_by": owner_user_id} for i, c in enumerate(payload["charge_types"])])
    ctid = {c["name"]: c["id"] for c in cts}
    n_exp = n_direct = n_read = 0
    for m in payload["months"]:
        post("bld_periods", [{"business_id": business_id, "building_id": bid, "period": m["period"]}])
        for c in payload["charge_types"]:
            if c["alloc_method"] == "area":
                total = m["sources"][c["col"]]
                supply, vat = (round(total / 1.1), total - round(total / 1.1)) if c["tax_treatment"] == "taxable" else (total, 0)
                post("bld_expenses", [{"business_id": business_id, "building_id": bid, "period": m["period"], "charge_type_id": ctid[c["name"]], "supply": supply, "vat": vat, "memo": f"원본 {m['file']} {c['col']}열 합", "doc_hash": f"{m['sha256']}:{c['col']}"}]); n_exp += 1
            else:
                rows = [{"business_id": business_id, "building_id": bid, "period": m["period"], "charge_type_id": ctid[c["name"]], "unit_id": uid[bl["unit_no"]], "amount": bl["lines"][c["col"]], "reason": f"원본 {c['col']}열"} for bl in m["bills"] if bl["lines"][c["col"]]]
                if rows: post("bld_direct_charges", rows); n_direct += len(rows)
        # 검침: 전기·수도 계량기 생성 + 지침(원본이 사용량을 직접 쓰면 usage_override)
        for kind in ("electric", "water"):
            meters = post("bld_meters", [{"business_id": business_id, "building_id": bid, "unit_id": uid[x["unit_no"]], "kind": kind, "unit_label": "kWh" if kind == "electric" else "㎥"} for x in m["meters"] if x[kind]["curr"] is not None and x["unit_no"] in uid and m is payload["months"][0]]) if m is payload["months"][0] else []
            # 두 번째 달부터는 기존 계량기를 조회해야 하므로 메인이 bld_import_stage/commit 경로를 쓰는 편이 낫다 — 여기서는 첫 달만 예시
            for mt, x in zip(meters, [x for x in m["meters"] if x[kind]["curr"] is not None and x["unit_no"] in uid]):
                prev, curr, usage = x[kind]["prev"] or 0, x[kind]["curr"], x[kind]["usage"]
                post("bld_meter_readings", [{"business_id": business_id, "meter_id": mt["id"], "period": m["period"], "prev_reading": prev, "curr_reading": curr,
                                             "usage_override": usage if usage is not None and abs((curr - prev) - usage) > 0.001 else None, "reason": "estimated" if usage is not None and abs((curr - prev) - usage) > 0.001 else None}]); n_read += 1
    return {"building_id": bid, "units": len(units), "parties": len(parties), "charge_types": len(cts), "expenses": n_exp, "direct_charges": n_direct, "readings_first_month": n_read}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=r"C:\Users\buffy\OneDrive\바탕 화면\개인 프로젝트\관리비 파일")
    ap.add_argument("--out", default=os.environ.get("CAM_OUT", ""))
    a = ap.parse_args()
    src = Path(a.src)
    files = {"2026-06": src / "26년 06월 관리비.xlsx", "2026-07": src / "26년 07월 관리비.xlsx", "2026-08": src / "26년 08월 관리비.xlsx"}
    months = [read_month(p, per) for per, p in files.items()]
    payload = build_payload(months)
    if a.out:
        out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
        (out / "building-import.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    # 보고: 건수·합계·차이만
    print("건물 1 / 호실 %d / 당사자 %d / 항목 %d / 월 %d" % (len(payload["units"]), len(payload["parties"]), len(payload["charge_types"]), len(payload["months"])))
    print("%-8s %5s %12s %12s %10s %8s %8s %12s" % ("월", "건수", "원본기준", "BL반올림합", "원액합", "차이", "줄합차", "3%연체(제외)"))
    total_units = 0
    for r in payload["reconcile"]:
        total_units += r["units"]
        print("%-8s %5d %12s %12s %10.2f %8s %8s %12s" % (r["period"], r["units"], f"{r['expected']:,}", f"{r['sum_rounded_BL']:,}", r["sum_raw_BL"], r["diff_expected_vs_rounded"], r["diff_lines_vs_rounded"], f"{r['late_fee_original_sum_skipped']:,}"))
    print("합계 %d건 / 원본 기준 합 %s / BL 반올림 합 %s" % (total_units, f"{sum(EXPECTED.values()):,}", f"{sum(r['sum_rounded_BL'] for r in payload['reconcile']):,}"))
    nine = sum(1 for p in payload["parties"] if p["biz_reg_no"] and len(p["biz_reg_no"]) != 10)
    print("사업자번호 자리수 이상(10자리 아님) 당사자: %d명 → 발행 전 확인 필요" % nine)
    if a.out: print("JSON:", str(Path(a.out) / "building-import.json"))

if __name__ == "__main__":
    main()
