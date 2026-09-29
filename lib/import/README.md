# lib/import — 건물 관리비 외부 엑셀 자동 가져오기 엔진

한전 전기·수도·가스·원격검침 업체·은행 거래내역·업체 청구서처럼 양식이 제각각인
xlsx/xls/csv를 업로드받아 구조화된 행으로 바꾸는 순수 로직. UI(업로드 → 매핑 확인 →
미리보기 → 확정 마법사)는 이 레이어를 그대로 가져다 쓰면 된다.

동의어 사전·형식 규칙·검증 규칙은
`docs/design-references/2026-09-29-building-cam-gap-research.md` D절(외부 엑셀 가져오기)을
반영했다.

## 4단계 사용법

```ts
import {
  parseSpreadsheet,
  detectHeaderRow,
  suggestMapping,
  validateRows,
  checkBatchTotal,
  toStagingRows,
} from "@/lib/import";

// 1) 업로드된 파일(Buffer) 파싱
const { sheets } = await parseSpreadsheet(fileBuffer, fileName);
const rows = sheets[0].rows; // string[][]

// 2) 머리글 행 자동 탐지 + 소스 종류(meter/bill/bank/expense) 추정
const header = detectHeaderRow(rows); // null이면 사용자가 수동으로 헤더 행을 지정해야 함
if (!header) throw new Error("머리글을 찾지 못했습니다. 수동 지정이 필요합니다.");

// 3) 필드 자동 매핑(화면에서 사용자가 고칠 수 있도록 field→columnIndex로 노출)
const mapping = suggestMapping(header.headers, header.sourceKind);
// mapping.fingerprint를 매핑 템플릿 캐시 키로 저장해두면 다음 번 같은 양식은 자동 적용 가능

// 4) 데이터 행 검증(머리글 다음 행부터)
const dataRows = rows.slice(header.headerRowIndex + 1);
const validated = validateRows(dataRows, mapping, {
  units: existingUnitLabels, // 건물의 실제 호실 목록(있으면 퍼지 매칭, V4/V5)
  period: "2026-08",
  expectedUnit: "kWh", // 계량기 단위(V12)
  openingBalance: 5000000, // 은행 이월 잔액(V9)
  expectedCharges: { "101호": 165000 }, // 은행 입금 후보 매칭용 청구액(V11, 자동배정 아님)
});

// 합계 대조(V8) — 원 고지서 총액을 사용자가 입력했을 때만
const totalIssue = checkBatchTotal(validated, "totalAmount", 1650000);

// 화면에서 오류/경고를 보여주고 사용자가 확정하면:
const stagingInput = toStagingRows(validated, mapping, "2026-08");
// stagingInput을 building-actions.ts의 스테이징 저장 서버 함수에 그대로 넘긴다.
```

## 지원 형식

| 형식 | 지원 | 비고 |
|---|---|---|
| `.xlsx` / `.xlsm` | O | `exceljs`, 병합 셀·수식(계산 결과만) 처리 |
| `.xls` (BIFF8/OLE2) | O | `xlsx`(공식 SheetJS `cdn.sheetjs.com` tgz, 홈택스 담당과 공유 설치 — npm 레지스트리의 `xlsx@0.18.5`는 CVE 미패치라 쓰지 않음). OLE2 시그니처가 아니면 즉시 `UNSUPPORTED_XLS`로 거부 |
| `.csv` | O | UTF-8(BOM 포함) / CP949(EUC-KR) 자동 판별 |

파일 10MB, 시트당 5만 행 제한(`ImportParseError`로 던짐, `code`로 분기: `FILE_TOO_LARGE`/`TOO_MANY_ROWS`/`UNSUPPORTED_XLS`/`UNSUPPORTED_FORMAT`/`DECODE_FAILED`).

## 소스 종류(SourceKind) & 필드

`meter`(검침) / `bill`(전기·수도·가스 청구) / `bank`(은행) / `expense`(비용) 4종.
필드 목록은 `types.ts`의 `SOURCE_FIELDS`, 한국어 동의어는 `synonyms.ts`의 `SYNONYMS`.

- `meter`: room, building, floor, occupantName, meterNo, customerNo, prevReading,
  currReading, usage, multiplier, unit, readDate
- `bill`: period, usage, unit, baseFee, usageFee, vat, totalAmount, dueDate,
  customerNo, heatValue, correction, waterFee, sewerFee, waterLevy
- `bank`: txnDatetime, depositor, depositAmount, withdrawAmount, balance, txnId,
  memo, branch — "맡기신금액"은 depositAmount, "찾으신금액"은 withdrawAmount로 인식
- `expense`: item, amount, supplyAmount, taxAmount, vendor, period

## 오류/경고 코드 (`RowIssue.code`) — 조사문서 D-8 V1~V12 대응

| 코드 | 규칙(V번호) | level |
|---|---|---|
| `MISSING_REQUIRED` | 소스별 필수 필드 누락 | error |
| `REVERSED_READING` | V1 당월 지침 < 전월 지침 | error(사유 입력 후 통과 — UI 책임) |
| `USAGE_MISMATCH` | V2 사용량 ≠ (당월−전월)×배율 | warning |
| `OUTLIER_USAGE` | V3 급증·급감(파일 내 사용량 중앙값의 3배 초과, 1차 근사) | warning |
| `ROOM_UNMATCHED` | V4 건물 호실 목록에 없는 표기 | error(가져오지 않음) |
| `ROOM_FUZZY` | 끝자리 숫자로 추정 매칭 | warning |
| `DUPLICATE_ROW` | V6 같은 파일 안 중복 키(호실/계량기번호/고객번호/거래번호 중 있는 것) | error |
| `AMOUNT_DECIMAL_ROUNDED` | D-7 금액에 소수점 — 반올림했으니 확인 필요 | warning |
| `UNIT_MISMATCH` | V12 파일 단위 ≠ 계량기 단위(`context.expectedUnit`) | error |
| `BALANCE_MISMATCH` | V9 은행 잔액 연속성 깨짐(누락 거래 의심) | warning |
| `DEPOSIT_CANDIDATE` | V11 입금자명·금액이 청구액과 일치 — **후보 제시만, 자동 배정 안 함** | warning |
| `TOTAL_MISMATCH` | V8 (`checkBatchTotal` 별도 호출) 파일 합계 ≠ 사용자가 입력한 고지서 총액 | warning |

`excluded: true`인 행은 `toStagingRows`에서 자동 제외된다:
- 합계/소계 행(정규식으로 판단)
- 은행 완전 중복 거래(V10 — 계좌·거래일시·금액·적요·잔액 동일, 두 번째부터 무시)

### 구현하지 않은 것 (V5, V7)

- **V5(활성 호실 중 파일에 누락된 호실 표시)**: `validateRows`는 파일에 있는 행만 보므로,
  건물의 전체 활성 호실 목록과 "이번 파일에 나온 호실"을 비교하는 건 호출부(화면/서버)가
  `context.units`와 `validated.map(r => r.normalized.room)`로 직접 diff하면 된다(한 줄이면 됨 — 이 레이어에 넣지 않았다).
- **V7(파일 자체의 중복 업로드 차단, "이미 9월분을 가져왔습니다")**: 이전에 확정된
  스테이징 기록을 조회해야 하므로 DB 담당의 서버 액션(`building-actions.ts`) 소관이다.

## 아직 정해지지 않은 것

- `BuildingStagingRowInput`(`types.ts`)은 잠정 인터페이스다. DB 담당이
  `lib/domain/building-types.ts`에 정식 타입을 만들면 필드명만 맞추면 되고,
  파서·매핑·검증 로직은 바뀌지 않는다.
- 매핑 템플릿 저장/재사용(같은 `fingerprint`로 다음 업로드 자동 매핑)은 이 레이어가
  계산만 해주고, 실제 저장은 DB 담당의 스테이징 테이블 몫이다.

## 테스트

`npx vitest run lib/import` — 30개 케이스: 파서(병합 셀·CP949·xls OLE2 판별·용량 제한),
머리글 자동 탐지, 소스 추정, 자동 매핑, 정규화(금액/날짜/기간/호실), 검침·청구·은행
검증 규칙(V1~V4, V6, V9~V11, D-7), 어댑터. 가짜 샘플은 `__fixtures__/build.ts`가
코드로 생성한다(실제 관리비 파일 사용 안 함).
