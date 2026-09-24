"use client";

import * as React from "react";
import { Search } from "@/lib/icons";
import { Button } from "@/components/ui/Button";

/**
 * 수동 코드 입력. 카메라가 없거나 인식이 안 될 때의 보조 수단 — 유일한 입력 경로가 되면 안 된다
 * (프롬프트 §8: "수동 입력만 제공하고 카메라 지원 완료라 하지 말라"). 이 컴포넌트는 CameraPanel과
 * 나란히 항상 노출된다.
 */
export function ManualEntry({ onSubmit, busy }: { onSubmit: (code: string) => void; busy?: boolean }) {
  const [value, setValue] = React.useState("");

  const submit = () => {
    const code = value.trim();
    if (!code) return;
    onSubmit(code);
    setValue("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="코드 직접 입력(개체코드·SKU·주문번호 등)"
        aria-label="코드 직접 입력"
        className="h-[44px] flex-1 rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3.5 text-sm text-t outline-none placeholder:text-t3 focus:border-[var(--accent)]"
      />
      <Button type="submit" size="md" loading={busy} disabled={!value.trim()}>
        <Search size={15} aria-hidden />
        조회
      </Button>
    </form>
  );
}
