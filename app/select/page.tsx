/**
 * 사업장 선택. listMyBusinesses() 결과의 4가지 경우(활성 소속/승인 대기/빈 목록/조회 실패)를
 * 서로 다른 화면으로 보여준다(계약 §5-5). 활성 소속이 정확히 1개면 서버에서 바로 이동시킨다.
 */
import { redirect } from "next/navigation";
import { listMyBusinesses } from "@/lib/auth/actions";
import { SelectView } from "./SelectView";

export default async function SelectPage() {
  const result = await listMyBusinesses();

  if (!result.ok && result.reason === "unauthenticated") {
    redirect("/login");
  }

  if (result.ok && result.businesses.length === 1 && result.pending.length === 0) {
    redirect(`/w/${result.businesses[0].id}`);
  }

  return <SelectView result={result} />;
}
