import { Clock } from "@/lib/icons";
import { AuthButton } from "@/components/auth/AuthButton";

export interface PendingApprovalCardProps {
  email?: string;
  businessName?: string;
  onLogout: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

/** 계정은 있으나 사업장 승인 대기 중인 상태. 오류가 아니라 정상적인 대기 상태임을 알린다. */
export function PendingApprovalCard({
  email,
  businessName,
  onLogout,
  onRefresh,
  refreshing = false,
}: PendingApprovalCardProps) {
  return (
    <div className="mx-auto flex w-full max-w-[360px] flex-col items-center gap-2 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-auth-field-bd bg-auth-field text-auth-tx">
        <Clock size={22} aria-hidden />
      </div>
      <h1 className="text-[20px] font-semibold text-auth-tx">승인 대기 중입니다</h1>
      <p className="max-w-[320px] text-[12.5px] leading-relaxed text-auth-tx2">
        {businessName ? `${businessName}에 ` : ""}
        가입 신청이 접수되었습니다. 관리자가 승인하면
        {email ? ` ${email} 계정으로` : ""} 이용할 수 있습니다.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
        {onRefresh && (
          <AuthButton variant="ghost" onClick={onRefresh} loading={refreshing}>
            승인 상태 새로고침
          </AuthButton>
        )}
        <AuthButton variant="ghost" onClick={onLogout}>
          로그아웃
        </AuthButton>
      </div>
    </div>
  );
}
