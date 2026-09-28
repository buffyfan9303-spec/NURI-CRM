"use client";

/**
 * 목록 화면 공용 정렬 엔진 — TanStack Table v9(`rowSortingFeature`)만 가져다 쓰고, 셀 마크업은
 * 기존 손으로 만든 JSX(TableOrCards, listkit 배지 등)를 그대로 둔다. v9은 `FlexRender`로
 * 셀까지 표 라이브러리가 그리지만, 이 프로젝트 표는 배지·CellName·요약 줄이 섞인 합성 셀이 많아
 * 그 렌더러를 다시 쓰는 대신 "정렬된 rows 배열"만 얻어 쓴다 — 정렬 로직은 진짜 TanStack Table.
 *
 * v9의 Column<TFeatures, TData, TValue> 제네릭은 호출부마다 다른 데이터 타입을 받아야 해서
 * 내부적으로 any로 좁힌다(런타임 동작에는 영향 없음 — 정렬 비교자는 accessors가 준다).
 */
import * as React from "react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  sortFn_alphanumeric,
  sortFn_text,
  sortFn_datetime,
  sortFn_basic,
  type SortingState,
} from "@tanstack/react-table";

// v9는 정렬 함수를 자동으로 등록하지 않는다 — 비워두면 "sortFn 'alphanumeric' (auto) for column …
// is not registered" 경고와 함께 정렬이 조용히 깨진다. 이 훅의 컬럼은 문자열/숫자/날짜가 섞여
// 있어 auto-detect가 어떤 이름을 고르든 걸리게 흔히 쓰는 4개를 다 등록해 둔다.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime, basic: sortFn_basic },
});

/** SortableTh 쪽에서 쓰는 표준화한 Column 타입(제네릭 부담 제거). */
export type SortColumn = {
  getIsSorted: () => false | "asc" | "desc";
  toggleSorting: (desc?: boolean) => void;
};

/** 정렬 키 → 그 행에서 비교할 값을 뽑는 함수. 문자열은 localeCompare, 숫자는 크기로 비교된다. */
export type SortAccessors<T> = Record<string, (row: T) => string | number | null>;

export function useSortedRows<T>(
  rows: T[],
  accessors: SortAccessors<T>,
  sorting: SortingState,
  setSorting: (s: SortingState | ((old: SortingState) => SortingState)) => void
) {
  const helper = React.useMemo(() => createColumnHelper<typeof features, any>(), []);
  const accessorKeys = Object.keys(accessors).join(",");
  const columns = React.useMemo(
    () =>
      Object.entries(accessors).map(([id, fn]) =>
        helper.accessor((row: T) => fn(row) ?? "", { id, header: id })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [helper, accessorKeys]
  );
  const table = useTable({ features, data: rows as any[], columns: columns as any, state: { sorting }, onSortingChange: setSorting });
  const sortedRows: T[] = React.useMemo(
    () => (sorting.length === 0 ? rows : (table.getSortedRowModel().rows.map((r) => r.original) as T[])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, rows, sorting]
  );
  const getColumn = (id: string): SortColumn => table.getColumn(id) as unknown as SortColumn;
  return { sortedRows, getColumn };
}
