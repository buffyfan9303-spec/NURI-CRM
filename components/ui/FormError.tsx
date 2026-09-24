import { CircleAlert } from "@/lib/icons";

/** 필드 하나의 오류 메시지. 색상만이 아니라 아이콘+텍스트로 상태를 전달한다. */
export function FormError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-et"
    >
      <CircleAlert size={14} className="mt-[1px] shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}
