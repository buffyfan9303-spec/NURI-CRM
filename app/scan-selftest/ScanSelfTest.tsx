"use client";

import * as React from "react";
import { IconCircleCheck, IconCircleX, IconLoader2 } from "@tabler/icons-react";
import { resolveDetector, getNativeSupportedFormats, SCAN_FORMATS, type ScanFormat } from "@/lib/scan/detector";

type CaseResult = { format: ScanFormat; text: string; pass: boolean; decoded: string | null; error?: string };

const CASES: { format: ScanFormat; zxingFormat: string; text: string }[] = [
  { format: "qr_code", zxingFormat: "QRCode", text: "NURI-SCAN-SELFTEST" },
  { format: "code_128", zxingFormat: "Code128", text: "ORD-2026-000123" },
  { format: "ean_13", zxingFormat: "EAN13", text: "4006381333931" }, // 실존 유효 체크섬(예시 상품 코드)
];

export function ScanSelfTest() {
  const [native, setNative] = React.useState<readonly string[] | null | "checking">("checking");
  const [engine, setEngine] = React.useState<string>("확인 중…");
  const [results, setResults] = React.useState<CaseResult[] | null>(null);
  const [running, setRunning] = React.useState(false);

  const run = React.useCallback(async () => {
    setRunning(true);
    setResults(null);
    setNative(await getNativeSupportedFormats());

    const { detector, info } = await resolveDetector(SCAN_FORMATS);
    setEngine(`${info.engine === "native" ? "네이티브 BarcodeDetector" : "내장 WASM 디코더(barcode-detector/ponyfill)"} · 지원 형식 ${info.supportedFormats.length}개`);

    const { writeBarcode } = await import("zxing-wasm/writer");
    const out: CaseResult[] = [];
    for (const c of CASES) {
      try {
        const written = await writeBarcode(c.text, { format: c.zxingFormat as never });
        if (!written.image) throw new Error(written.error || "인코딩 실패");
        const bitmap = await createImageBitmap(written.image);
        const detected = await detector.detect(bitmap);
        const hit = detected.find((d) => d.rawValue === c.text);
        out.push({ format: c.format, text: c.text, pass: Boolean(hit), decoded: detected[0]?.rawValue ?? null });
      } catch (e) {
        out.push({ format: c.format, text: c.text, pass: false, decoded: null, error: e instanceof Error ? e.message : String(e) });
      }
    }
    setResults(out);
    setRunning(false);
  }, []);

  React.useEffect(() => {
    void run();
  }, [run]);

  const allPass = results?.every((r) => r.pass) ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 p-3.5 text-[12.5px] text-t2">
        <p>
          네이티브 BarcodeDetector.getSupportedFormats(): {native === "checking" ? "확인 중…" : native === null ? "이 브라우저에는 없음(정상 — 대부분의 데스크톱 Chrome/Windows가 이에 해당)" : native.join(", ")}
        </p>
        <p className="mt-1">실제 사용 엔진: {engine}</p>
      </div>

      <div className="flex flex-col gap-2">
        {(results ?? CASES.map((c) => ({ format: c.format, text: c.text, pass: false, decoded: null }))).map((r) => (
          <div
            key={r.format}
            className={`flex items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--bd)] px-3.5 py-2.5 text-[13px] ${
              results === null ? "bg-sf2 text-t2" : r.pass ? "bg-okb text-okt" : "bg-eb text-et"
            }`}
          >
            {results === null ? (
              <IconLoader2 size={16} className="animate-spin" aria-hidden />
            ) : r.pass ? (
              <IconCircleCheck size={16} aria-hidden />
            ) : (
              <IconCircleX size={16} aria-hidden />
            )}
            <span className="font-semibold">{r.format}</span>
            <span className="font-mono text-[11.5px]">{r.text}</span>
            {results !== null && !r.pass && <span className="text-[11.5px]">{("error" in r && r.error) || `디코딩 결과: ${r.decoded ?? "없음"}`}</span>}
          </div>
        ))}
      </div>

      {results && (
        <p className={`text-[13px] font-semibold ${allPass ? "text-okt" : "text-et"}`}>
          {allPass ? "QR · Code128 · EAN13 세 형식 모두 이 브라우저에서 실제로 인코딩→디코딩 성공" : "일부 형식이 실패했습니다 — 위 내역을 확인하세요."}
        </p>
      )}

      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="self-start rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-4 py-2 text-[13px] text-t hover:bg-sf2 disabled:opacity-50"
      >
        다시 실행
      </button>
    </div>
  );
}
