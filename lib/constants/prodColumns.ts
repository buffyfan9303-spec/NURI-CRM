import type { KanbanColumn } from "@/types/order";

/**
 * 칸반 보드 컬럼 6종 — 색·아이콘 포함.
 * Phase 1.7 KanbanColumn 컴포넌트에서 import 한다.
 */
export interface ProdColumnDef {
  key: KanbanColumn;
  color: string;          // 컬럼 상단 띠 색
  iconName: string;       // Tabler icon name (kebab-case)
}

export const PROD_COLUMNS: ProdColumnDef[] = [
  { key: "주문접수", color: "#1840a0", iconName: "file-plus" },
  { key: "원단발주", color: "#c8914a", iconName: "package-import" },
  { key: "재단중",   color: "#7c3aed", iconName: "cut" },
  { key: "봉제중",   color: "#e8734a", iconName: "needle" },
  { key: "검수중",   color: "#0d9488", iconName: "eye-check" },
  { key: "배송예정", color: "#22c55e", iconName: "truck" },
];
