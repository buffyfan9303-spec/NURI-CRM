/**
 * 바코드/QR 디코더 — 네이티브와 라이브러리 폴백을 하나의 인터페이스로 감싼다.
 *
 * 확인된 사실(추측 아님, node_modules 실제 조사 + Node 런타임 실측):
 *  - `@yudiel/react-qr-scanner`(이미 설치됨, package.json)는 내부적으로 `barcode-detector`
 *    패키지의 `ponyfill`(ZXing-C++ WASM, zxing-wasm)만 사용한다 — 네이티브 유무와 무관하게
 *    항상 이 WASM 구현으로 디코딩한다. `isBarcodeDetectorSupported()`는 정보 제공용일 뿐,
 *    실제 디코딩 경로 선택에 관여하지 않는다(node_modules/@yudiel/react-qr-scanner/dist/index.esm.mjs).
 *  - 그 WASM 구현은 QR·Code128·EAN13을 포함해 zxing-cpp가 지원하는 거의 모든 형식을 지원한다
 *    (node_modules/barcode-detector/dist/es/utils.d.ts 의 BARCODE_FORMATS 목록에 `qr_code`,
 *    `code_128`, `ean_13` 전부 포함되어 있음을 직접 확인).
 *  - 따라서 새 바코드 라이브러리(@zxing/browser 등)를 추가로 설치할 필요가 없다 — 이미 설치된
 *    의존성이 세 형식을 전부 실제로 디코딩한다(scripts/test-scan.mjs 가 encode→decode 왕복으로 증명).
 *
 * 그럼에도 "네이티브 BarcodeDetector가 있고 필요한 형식을 지원하면 그걸 쓴다"는 요구를 문자
 * 그대로 지키기 위해, 여기서는 매 세션마다 `window.BarcodeDetector.getSupportedFormats()`를
 * 실제로 호출해 확인하고(있다고 가정하지 않음), 세 형식을 전부 지원할 때만 네이티브를 쓴다.
 * Windows Chrome처럼 네이티브가 아예 없는 환경(대다수)에서는 위 WASM 폴백으로 자동 전환된다.
 */

export const SCAN_FORMATS = ["qr_code", "code_128", "ean_13"] as const;
export type ScanFormat = (typeof SCAN_FORMATS)[number];

export interface DetectedCode {
  rawValue: string;
  format: string;
}

/** 네이티브 BarcodeDetector와 barcode-detector/ponyfill(WASM)이 공통으로 만족하는 최소 인터페이스.
 *  테스트에서는 이 인터페이스만 구현한 가짜 객체를 주입하면 된다(카메라 불필요). */
export interface BarcodeDetectorLike {
  detect(source: unknown): Promise<DetectedCode[]>;
}

export interface DetectorInfo {
  engine: "native" | "wasm";
  supportedFormats: readonly string[];
  /** 요청한 형식 중 이 엔진이 실제로 지원 못 하는 것. 네이티브 선택 시에는 항상 빈 배열이다. */
  missingFormats: readonly string[];
}

interface NativeBarcodeDetectorCtor {
  new (opts: { formats: readonly string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<readonly string[]>;
}

function getNativeCtor(): NativeBarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector;
  return ctor ?? null;
}

/** 진단용: 네이티브 BarcodeDetector가 실제로 어떤 형식을 지원하는지. 없으면 null(있다고 가정하지 않음). */
export async function getNativeSupportedFormats(): Promise<readonly string[] | null> {
  const ctor = getNativeCtor();
  if (!ctor) return null;
  try {
    return await ctor.getSupportedFormats();
  } catch {
    return null;
  }
}

/**
 * 우선순위: ① 네이티브가 있고 요청 형식을 전부 지원 → 네이티브. ② 아니면 WASM 폴백.
 * 폴백은 동적 import — 스캔 화면에 실제로 진입할 때만 ~1.4MB WASM을 내려받는다.
 */
export async function resolveDetector(
  formats: readonly ScanFormat[] = SCAN_FORMATS
): Promise<{ detector: BarcodeDetectorLike; info: DetectorInfo }> {
  const native = getNativeCtor();
  if (native) {
    try {
      const supported = await native.getSupportedFormats();
      const missing = formats.filter((f) => !supported.includes(f));
      if (missing.length === 0) {
        return {
          detector: new native({ formats }),
          info: { engine: "native", supportedFormats: supported, missingFormats: [] },
        };
      }
    } catch {
      // getSupportedFormats 자체가 실패하면 네이티브를 신뢰하지 않고 폴백으로 내려간다.
    }
  }

  const { BarcodeDetector: WasmDetector } = await import("barcode-detector/ponyfill");
  const supported = await WasmDetector.getSupportedFormats();
  const missing = formats.filter((f) => !(supported as readonly string[]).includes(f));
  return {
    detector: new WasmDetector({ formats: formats as unknown as never }) as unknown as BarcodeDetectorLike,
    info: { engine: "wasm", supportedFormats: supported as readonly string[], missingFormats: missing },
  };
}

export interface ScanEngineHandle {
  stop(): void;
}

/**
 * 비디오 프레임을 주기적으로 디코더에 넘기는 루프. 카메라/스트림 소유권은 호출부에 있다 —
 * 이 함수는 video 엘리먼트를 읽기만 하고 트랙을 만들거나 정리하지 않는다(관심사 분리 = 테스트 용이성).
 * `video` 는 `{ readyState }`만 있으면 되므로 테스트에서는 가짜 객체를 넣을 수 있다.
 */
export function startScanEngine(
  detector: BarcodeDetectorLike,
  video: { readyState: number },
  onResult: (code: DetectedCode) => void,
  opts?: { intervalMs?: number; onError?: (e: unknown) => void; now?: () => number; schedule?: (cb: (t: number) => void) => number; cancel?: (id: number) => void }
): ScanEngineHandle {
  const intervalMs = opts?.intervalMs ?? 220;
  const now = opts?.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const schedule =
    opts?.schedule ??
    ((cb: (t: number) => void) =>
      typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(cb) : (setTimeout(() => cb(now()), 16) as unknown as number));
  const cancel =
    opts?.cancel ?? ((id: number) => (typeof cancelAnimationFrame !== "undefined" ? cancelAnimationFrame(id) : clearTimeout(id)));

  let stopped = false;
  let inFlight = false;
  let lastTick = 0;
  let handle = 0;

  const tick = (t: number) => {
    if (stopped) return;
    handle = schedule(tick);
    if (inFlight || t - lastTick < intervalMs) return;
    // HTMLVideoElement.HAVE_CURRENT_DATA == 2. 그 미만이면 아직 디코딩할 프레임이 없다.
    if (video.readyState < 2) return;
    lastTick = t;
    inFlight = true;
    detector
      .detect(video)
      .then((codes) => {
        for (const c of codes) onResult(c);
      })
      .catch((e) => opts?.onError?.(e))
      .finally(() => {
        inFlight = false;
      });
  };
  handle = schedule(tick);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cancel(handle);
    },
  };
}
