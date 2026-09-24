/**
 * 스캔 화면. 카메라/키보드형 스캐너/수동 입력 → crm.resolve_scan/stage_scan_batch → 검토 → 확정.
 *
 * industry.features.scan이 false인 업종(미용실·학원)은 메뉴에도 없지만(lib/industry/config.ts의
 * nav에 scan 항목 자체가 없음), 직접 URL로 들어오는 경우까지 막기 위해 여기서도 다시 확인한다
 * (계약 §1: 업종은 권한의 근거가 아니지만, "이 업종이 이 기능을 쓰는가"는 업종 설정의 몫이다).
 */
import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { resolveFeatures } from "@/lib/industry/config";
import { ScanWorkspace } from "@/components/scan/ScanWorkspace";
import { getAccess } from "../access";

export default async function ScanPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null; // layout이 리다이렉트 처리
    const msg = accessMessage(access);
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          {access.reason === "forbidden" ? (
            <ForbiddenState title={msg.title} description={msg.detail} />
          ) : (
            <ErrorState title={msg.title} description={msg.detail} />
          )}
        </Card>
      </div>
    );
  }

  const features = resolveFeatures(access.industry, access.settings);
  if (!features.scan) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ForbiddenState
            title="이 업종에서는 스캔을 사용하지 않습니다."
            description="현재 사업장의 업종 설정에 스캔 기능이 꺼져 있습니다. 관리자에게 문의하세요."
          />
        </Card>
      </div>
    );
  }

  return <ScanWorkspace businessId={access.businessId} industry={access.industry} canWrite={access.caps.includes("write")} />;
}
