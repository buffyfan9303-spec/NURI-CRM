/**
 * PDF 한글 폰트 등록 — Noto Sans KR(OFL-1.1, `public/fonts/`). @react-pdf/renderer는
 * 가변 폰트(variable font)를 못 읽어 굵기별 정적 TTF(400/700)만 둔다.
 * 서버 라우트(Node 런타임)에서만 부른다. 한 프로세스에서 한 번만 등록하면 된다.
 */
import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

export function registerKoreanFont() {
  if (registered) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "NotoSansKR",
    fonts: [
      { src: path.join(dir, "NotoSansKR-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(dir, "NotoSansKR-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  registered = true;
}
