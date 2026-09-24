/**
 * 결함 #12: 등원 키오스크는 셸 없는 `/kiosk/{businessId}/attendance`로 옮겼다(학생용 태블릿에
 * 관리자 사이드바·계정 메뉴·"+ 수강 등록"이 노출되던 문제). 이 경로는 새 경로로 보내기만 한다.
 * 권한 판정은 새 경로의 page.tsx가 다시 한다(여기서 서버 접근 검사를 하지 않는다 — redirect가
 * 유일한 역할).
 */
import { redirect } from "next/navigation";

export default function LegacyAttendanceKioskRedirect({ params }: { params: { businessId: string } }) {
  redirect(`/kiosk/${params.businessId}/attendance`);
}
