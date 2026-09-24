/**
 * 6색 아바타 팔레트 — 이름 해시 기반 컬러 매핑.
 * 기존 _avCls / _AV_CLS 와 동일 알고리즘.
 *
 * Tailwind 사용 시: <div className={`mtm-av ${avatarColorClass(name)}`}>...
 *
 * CSS 클래스는 globals.css 또는 components/customer/CustomerAvatar.tsx 에서 정의.
 */
const PALETTE = ["av-c0", "av-c1", "av-c2", "av-c3", "av-c4", "av-c5"] as const;
export type AvatarColorClass = (typeof PALETTE)[number];

export function avatarColorClass(name: string): AvatarColorClass {
  let code = 0;
  for (let i = 0; i < name.length; i++) {
    code += name.charCodeAt(i);
  }
  return PALETTE[code % PALETTE.length];
}

/**
 * 아바타 표시용 첫 글자 (한글/영문 모두 대응).
 */
export function avatarInitial(name: string): string {
  return (name || "?").charAt(0);
}
