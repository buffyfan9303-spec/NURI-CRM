"use client";

import * as React from "react";
import { ChevronRight, MailQuestion, Search, TriangleAlert, INDUSTRY_ICON, FALLBACK_ICON } from "@/lib/icons";
import { Spinner } from "@/components/ui/Spinner";
import { AuthButton } from "@/components/auth/AuthButton";
import type { Industry } from "@/lib/industry/config";

export interface BusinessOption {
  id: string;
  name: string;
  industry: string;
  role: string;
  memberCount?: number;
}

export interface BusinessPickerProps {
  businesses: BusinessOption[];
  onPick: (id: string) => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}

const INDUSTRY_LABEL: Record<string, string> = {
  factory: "의류공장",
  rental: "의류렌탈",
  unmanned: "무인매장",
  salon: "미용실",
  academy: "학원",
};

const ROLE_LABEL: Record<string, string> = {
  owner: "대표",
  manager: "매니저",
  staff: "직원",
  accountant: "회계",
  viewer: "열람",
};

/**
 * 실제 사업장명·업종·내 역할만 보여준다. 가짜 성과 수치·데모 매장 금지.
 * 오류와 "소속된 사업장 없음"(초대·가입 안내)은 서로 다른 화면이다.
 *
 * 웜톤 인증 세계(§8·§9) 안에서 쓰이므로 업무 화면 토큰(bg-sf 등)이 아니라 auth-* 토큰만 쓴다.
 * 타일은 불투명한 흰 카드가 아니라 반투명 면이다(§10.2). 1280px 이상 최대 3열, 태블릿 가로 2열,
 * 세로 좁으면 1열. 소속이 여러 개일 때만 검색을 보여준다.
 */
export function BusinessPicker({ businesses, onPick, loading = false, error, onRetry }: BusinessPickerProps) {
  const [query, setQuery] = React.useState("");

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <Spinner size={26} />
        <p className="text-[13px] text-auth-tx2">소속된 사업장을 확인하는 중…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <div className="mb-1 flex h-[44px] w-[44px] items-center justify-center rounded-full border border-auth-field-bd bg-auth-field text-auth-tx">
          <TriangleAlert size={20} aria-hidden />
        </div>
        <p className="text-[14px] font-medium text-auth-tx">사업장 목록을 불러오지 못했습니다.</p>
        <p className="max-w-[320px] text-[12.5px] leading-relaxed text-auth-tx2">{error}</p>
        {onRetry && (
          <AuthButton variant="ghost" onClick={onRetry} className="mt-2">
            다시 시도
          </AuthButton>
        )}
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
        <div className="mb-1 flex h-[44px] w-[44px] items-center justify-center rounded-full border border-auth-field-bd bg-auth-field text-auth-tx">
          <MailQuestion size={20} aria-hidden />
        </div>
        <p className="text-[14px] font-medium text-auth-tx">아직 소속된 사업장이 없습니다.</p>
        <p className="max-w-[320px] text-[12.5px] leading-relaxed text-auth-tx2">
          사업장 관리자에게 초대를 요청하거나, 새 사업장 가입 신청 결과를 기다려주세요.
        </p>
      </div>
    );
  }

  const filtered = query.trim()
    ? businesses.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()))
    : businesses;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-auth-tx">사업장 선택</h1>
          <p className="mt-1 text-[12.5px] text-auth-tx2">소속된 사업장 중 이번에 사용할 곳을 고르세요.</p>
        </div>
        {businesses.length > 5 && (
          <div className="relative w-full max-w-[240px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-auth-tx2" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="사업장 검색"
              aria-label="사업장 검색"
              className="h-[36px] w-full rounded-full border border-auth-field-bd bg-auth-field pl-8 pr-3 text-[13px] text-auth-tx outline-none placeholder:text-auth-tx2 focus:border-[var(--auth-tx)]"
            />
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-[13px] text-auth-tx2">&ldquo;{query}&rdquo;와(과) 일치하는 사업장이 없습니다.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded text-[12.5px] font-medium text-auth-tx hover:underline"
          >
            검색어 지우기
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5" role="list">
          {filtered.map((b) => {
            const Icon = INDUSTRY_ICON[b.industry as Industry] ?? FALLBACK_ICON;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onPick(b.id)}
                  className="flex h-full w-full items-start gap-3 rounded-[16px] border border-auth-field-bd bg-auth-field px-4 py-3.5 text-left transition-colors hover:bg-[var(--auth-field-bd)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-tx)]"
                >
                  <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--auth-field-bd)] text-auth-tx">
                    <Icon size={17} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-auth-tx">{b.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-[var(--auth-field-bd)] px-2 py-0.5 text-[11px] font-medium text-auth-tx">
                        {INDUSTRY_LABEL[b.industry] ?? b.industry}
                      </span>
                      <span className="text-[11.5px] text-auth-tx2">{ROLE_LABEL[b.role] ?? b.role}</span>
                    </span>
                  </span>
                  <ChevronRight size={16} className="mt-1.5 shrink-0 text-auth-tx2" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
