"use client";

/**
 * "키오스크 종료" — 확인을 거친 뒤에만 관리자 출결 화면으로 돌아간다(학생이 실수로 못 나가게).
 * 전체화면 요청(requestFullscreen)은 선택 사항이라 브라우저가 거부해도 조용히 무시한다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export function KioskExit({ businessId }: { businessId: string }) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label="키오스크 종료"
        className="absolute right-3 top-3 flex h-[40px] items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-[12.5px] font-medium text-t2 hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]"
      >
        <LogOut size={14} aria-hidden />
        키오스크 종료
      </button>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="키오스크를 종료할까요?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button onClick={() => router.push(`/w/${businessId}/attendance`)}>종료하고 출결 화면으로</Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-t2">종료하면 관리자 출결 화면으로 돌아갑니다.</p>
      </Modal>
    </>
  );
}
