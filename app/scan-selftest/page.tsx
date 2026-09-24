/**
 * 인증 불필요한 브라우저 셀프테스트. "QR만 되는데 바코드도 된다"는 주장을 스크린샷 없이 못 하게
 * 막기 위한 실증 페이지 — QR/Code128/EAN13을 실제로 인코딩(zxing-wasm/writer)한 뒤, 앱이 실제로
 * 쓰는 디코더(lib/scan/detector.ts의 resolveDetector — 네이티브 우선, 없으면 barcode-detector
 * ponyfill/WASM)로 다시 디코딩해 원문과 비교한다. CRM 데이터/인증에 접근하지 않는다.
 */
import { ScanSelfTest } from "./ScanSelfTest";

export default function ScanSelfTestPage() {
  return (
    <div className="mx-auto max-w-[640px] p-6">
      <h1 className="mb-1 text-[18px] font-semibold text-t">스캔 디코더 셀프테스트</h1>
      <p className="mb-5 text-[12.5px] text-t2">
        이 페이지는 로그인 없이 동작하며 CRM 데이터에 접근하지 않습니다. 이 브라우저가 QR·Code128·EAN13을 실제로
        인코딩→디코딩할 수 있는지 즉시 검증합니다.
      </p>
      <ScanSelfTest />
    </div>
  );
}
