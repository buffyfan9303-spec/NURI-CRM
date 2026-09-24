// Node ESM 커스텀 리졸브 훅 — tsconfig의 "@/*" 별칭을 테스트 스크립트에서만 풀어준다.
// 새 패키지(tsconfig-paths 등) 추가 금지 원칙을 지키기 위해 node:module의 표준 register API
// (Node 20.6+)만 쓴다. 앱 빌드(Next.js)는 이 파일과 무관하게 자체 별칭 해석을 쓴다.
const projectRootHref = new URL("../", import.meta.url).href; // scripts/ 의 부모 = 프로젝트 루트

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let rel = specifier.slice(2);
    if (!/\.[a-zA-Z0-9]+$/.test(rel)) rel += ".ts"; // TS 소스는 확장자 없이 import하는 관례
    const target = new URL(rel, projectRootHref).href;
    return nextResolve(target, context);
  }
  return nextResolve(specifier, context);
}
