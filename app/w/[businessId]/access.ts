/**
 * checkAccess를 요청 단위로 캐시한다. layout.tsx/page.tsx/staff/page.tsx가 같은 요청 안에서
 * 각자 접근을 재확인해도 DB 왕복이 중복되지 않는다(React.cache는 요청별로만 캐시하므로
 * "권한은 항상 다시 읽는다"는 원칙과 충돌하지 않는다 — 다음 요청부터는 새로 읽는다).
 */
import { cache } from "react";
import { checkAccess } from "@/lib/auth/access";

export const getAccess = cache(checkAccess);
