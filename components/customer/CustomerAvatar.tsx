/**
 * 고객 아바타 — 이름 해시로 6색 팔레트 중 하나 자동 배정.
 * 기존 .mtm-av/.dp-av 디자인 모두 이 컴포넌트로 통합.
 */
"use client";

import { avatarColorClass, avatarInitial } from "@/lib/utils/avatar";
import { cn } from "@/lib/utils/cn";

interface CustomerAvatarProps {
  name: string;
  size?: number;
  className?: string;
  rounded?: "full" | "lg";
}

export function CustomerAvatar({
  name,
  size = 38,
  className,
  rounded = "full",
}: CustomerAvatarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center font-extrabold flex-shrink-0",
        avatarColorClass(name),
        rounded === "full" ? "rounded-full" : "rounded-[10px]",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {avatarInitial(name)}
    </div>
  );
}
