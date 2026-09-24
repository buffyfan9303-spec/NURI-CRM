/**
 * Topbar 용 검색 입력 — 기존 .search-inp 디자인.
 */
"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
}

export function SearchInput({ value, onChange, placeholder, width = 220 }: Props) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width, height: 36 }}
      className="py-2 px-3.5 border border-bd2 rounded-lg bg-sf text-t text-[13px] outline-none transition-colors placeholder:text-t3 focus:border-acc"
    />
  );
}
