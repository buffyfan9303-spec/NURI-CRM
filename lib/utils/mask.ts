/**
 * RBAC 마스킹 유틸 — factory 역할이 고객 PII 를 볼 때만 사용.
 * 기존 _maskName, _maskPhone 와 동일한 동작.
 */
import type { Role } from "@/types/auth";

export function maskName(name: string): string {
  if (!name || name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + name.slice(1, -1).replace(/./g, "*") + name[name.length - 1];
}

export function maskPhone(phone: string): string {
  return String(phone).replace(/(\d{3})-(\d{3,4})-(\d{4})/, "$1-****-$3");
}

/** 역할에 따라 이름을 마스킹 여부 결정 */
export function displayName(name: string, role: Role): string {
  return role === "factory" ? maskName(name) : name;
}

export function displayPhone(phone: string, role: Role): string {
  return role === "factory" ? maskPhone(phone) : phone;
}
