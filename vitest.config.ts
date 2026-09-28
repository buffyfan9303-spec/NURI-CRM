/**
 * lib/**\/*.test.ts 단위 테스트. `npx vitest run`. e2e/(Playwright)는 대상이 아니다
 * (계약: 단위 테스트는 vitest, 화면 회귀는 Playwright — 둘을 한 러너에 섞지 않는다).
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
