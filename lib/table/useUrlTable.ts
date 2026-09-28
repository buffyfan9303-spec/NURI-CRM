"use client";

/**
 * 목록 화면 공용: 검색어·상태 탭·기간 같은 필터를 URL 쿼리에 저장해 새로고침·링크 공유 후에도
 * 유지되게 하는 훅(nuqs) + 정렬 상태를 URL에 저장하는 훅(TanStack Table의 `SortingState`와
 * 같은 모양이라 `useReactTable({ state: { sorting } })`에 그대로 물릴 수 있다).
 *
 * 디자인·표 마크업(TableOrCards, listkit)은 그대로 두고 상태 관리만 이 훅으로 교체한다.
 */
import * as React from "react";
import { useQueryState, parseAsString } from "nuqs";
import type { SortingState } from "@tanstack/react-table";

/** 검색어·상태 탭 등 문자열 필터 하나를 URL 쿼리(`key`)에 저장한다. 빈 문자열이면 쿼리에서 지운다. */
export function useUrlParam(key: string, defaultValue = "") {
  return useQueryState(key, parseAsString.withDefault(defaultValue).withOptions({ clearOnDefault: true }));
}

/**
 * 정렬 상태를 URL 쿼리 `sort=컬럼:asc|desc` 하나로 저장한다.
 * TanStack Table에 그대로 물리려면: `useReactTable({ state: { sorting }, onSortingChange: setSorting, ... })`.
 */
export function useUrlSorting(
  defaultColumnId?: string,
  defaultDesc = false
): [SortingState, (s: SortingState | ((old: SortingState) => SortingState)) => void] {
  const [raw, setRaw] = useQueryState(
    "sort",
    parseAsString.withDefault(defaultColumnId ? `${defaultColumnId}:${defaultDesc ? "desc" : "asc"}` : "").withOptions({ clearOnDefault: true })
  );
  const sorting: SortingState = React.useMemo(() => {
    if (!raw) return [];
    const [id, dir] = raw.split(":");
    if (!id) return [];
    return [{ id, desc: dir === "desc" }];
  }, [raw]);
  const setSorting = React.useCallback(
    (next: SortingState | ((old: SortingState) => SortingState)) => {
      const resolved = typeof next === "function" ? next(sorting) : next;
      const first = resolved[0];
      setRaw(first ? `${first.id}:${first.desc ? "desc" : "asc"}` : "");
    },
    [sorting, setRaw]
  );
  return [sorting, setSorting];
}
