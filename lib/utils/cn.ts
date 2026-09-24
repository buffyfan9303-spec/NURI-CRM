import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind 클래스 머지 유틸 — shadcn/ui 표준 패턴.
 * 조건부 클래스를 깔끔하게 합치고 중복은 마지막 것이 우선.
 *
 *   cn('p-2 text-sm', isActive && 'bg-acc text-white', 'p-4')
 *   // → 'text-sm bg-acc text-white p-4'
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
