/**
 * 폼 공용 빌딩 블록.
 * 기존 .form-card / .form-row / .f-input / .f-label / .meas-box 디자인 1:1.
 * 어디서든 재사용 가능하도록 단일 파일에 묶음.
 */
"use client";

import { cn } from "@/lib/utils/cn";
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

/* ── Card ────────────────────────────────────────────────── */
export function FormCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-sf border border-bd rounded-xl py-6 px-[26px] mb-3 shadow-card", className)}>
      {children}
    </div>
  );
}

export function FormCardTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="text-sm font-extrabold text-t mb-[18px] pb-3.5 border-b border-bd flex items-center gap-2.5 tracking-tight">
      {icon}
      {children}
    </div>
  );
}

/* ── Row / Grid ──────────────────────────────────────────── */
export function FormRow({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div
      className={cn(
        "grid gap-3.5 mb-3.5",
        cols === 1 && "grid-cols-1",
        // 모바일(<640px)에서는 칸을 줄인다 — 모달(≈300px) 안 3열이면 입력칸이 90px 로 줄어 라벨이 겹친다.
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-2 sm:grid-cols-3"
      )}
    >
      {children}
    </div>
  );
}

/* ── Label / Input ───────────────────────────────────────── */
export function FLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="block text-[10px] font-bold text-t2 mb-1.5 uppercase tracking-[.4px]">
      {children} {required && <span className="text-et">*</span>}
    </label>
  );
}

export const FInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function FInput({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full py-2.5 px-3 border border-bd2 rounded-[7px] bg-sf2 text-t text-[13px] outline-none transition-colors",
          "placeholder:text-t3 focus:border-acc focus:shadow-[0_0_0_3px_rgba(12,31,53,.09)]",
          className
        )}
        {...rest}
      />
    );
  }
);

export const FTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function FTextarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full py-2.5 px-3 border border-bd2 rounded-[7px] bg-sf2 text-t text-[13px] outline-none transition-colors min-h-[72px] resize-y",
          "placeholder:text-t3 focus:border-acc",
          className
        )}
        {...rest}
      />
    );
  }
);

export const FSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function FSelect({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "w-full py-2.5 px-3 border border-bd2 rounded-[7px] bg-sf2 text-t text-[13px] outline-none cursor-pointer transition-colors",
          "focus:border-acc",
          className
        )}
        {...rest}
      >
        {children}
      </select>
    );
  }
);

/* ── Section header (in meas-box) ────────────────────────── */
export function FormSectionHd({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.8px] text-t2 mt-3.5 mb-2.5 pb-[7px] border-b border-bd2 border-dashed">
      {icon && <span className="opacity-70">{icon}</span>}
      {children}
    </div>
  );
}

/* ── Measurements box ────────────────────────────────────── */
export function MeasBox({ children }: { children: ReactNode }) {
  return (
    <div className="bg-sf2 border border-bd rounded-[10px] p-[18px] my-3">
      {children}
    </div>
  );
}

/* ── Actions row ─────────────────────────────────────────── */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end gap-2.5 mt-5 pt-4 border-t border-bd">
      {children}
    </div>
  );
}

/* ── Buttons ─────────────────────────────────────────────── */
export function BtnPrimary({ children, ...rest }: InputHTMLAttributes<HTMLButtonElement> & { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "py-2.5 px-6 bg-acc text-white rounded-[7px] text-[13px] font-bold cursor-pointer select-none flex items-center gap-1.5 transition-opacity shadow-card",
        "hover:opacity-90 active:scale-[.98]",
        rest.className
      )}
    >
      {children}
    </button>
  );
}

export function BtnGhost({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "py-2.5 px-5 border border-bd2 rounded-[7px] bg-transparent text-t cursor-pointer text-[13px] transition-colors hover:bg-sf2",
        rest.className
      )}
    >
      {children}
    </button>
  );
}
