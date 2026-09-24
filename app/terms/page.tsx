import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, Pending } from "@/components/auth/LegalDoc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "이용약관 | NURI CRM" };

/** 이용약관 — 사내 업무 시스템에 맞춘 최소 조항. 유료 결제 조항은 결제 도입 시 추가한다. */
export default function TermsPage() {
  const op = LEGAL.operator;
  return (
    <LegalDoc title="이용약관" updated={LEGAL.effectiveDate}>
      <h2>제1조 (목적)</h2>
      <p>
        이 약관은 {LEGAL.serviceName}(이하 &ldquo;서비스&rdquo;)의 이용 조건과 절차, 운영자와 이용자의 권리·의무를 정합니다. 운영자:{" "}
        {op ? `${op.company}` : <Pending />}
      </p>

      <h2>제2조 (정의)</h2>
      <ol>
        <li>&ldquo;사업장&rdquo;은 서비스에 등록되어 업무를 관리하는 매장·공방·학원 등을 말합니다.</li>
        <li>&ldquo;이용자&rdquo;는 사업장의 승인을 받아 서비스를 쓰는 직원(소유자·관리자·직원)을 말합니다.</li>
      </ol>

      <h2>제3조 (가입과 승인)</h2>
      <ol>
        <li>가입 신청 후 사업장 소유자 또는 관리자가 승인해야 해당 사업장의 데이터를 볼 수 있습니다.</li>
        <li>역할(소유자·관리자·직원)에 따라 볼 수 있는 화면과 할 수 있는 작업이 다릅니다.</li>
      </ol>

      <h2>제4조 (계정 관리)</h2>
      <ol>
        <li>이용자는 자기 계정과 비밀번호를 스스로 관리하며, 다른 사람에게 빌려주거나 공유하지 않습니다.</li>
        <li>계정이 도용된 것을 알게 되면 즉시 비밀번호를 바꾸고 사업장 관리자에게 알려야 합니다.</li>
      </ol>

      <h2>제5조 (이용자의 의무)</h2>
      <ol>
        <li>업무 목적 밖으로 고객 정보를 열람·복사·반출하지 않습니다.</li>
        <li>서비스의 보안 장치를 우회하거나 권한 밖의 데이터에 접근하려 하지 않습니다.</li>
        <li>고객에게 안내 문구를 보낼 때는 수신 동의 등 관련 법령을 지킵니다.</li>
      </ol>

      <h2>제6조 (데이터의 책임)</h2>
      <p>
        사업장이 입력한 고객 정보의 수집 근거와 정확성은 그 사업장이 책임집니다. 운영자는 사업장의 위탁을 받아 안전하게 보관·처리하며,
        자세한 내용은 <Link href="/privacy" className="font-semibold text-[var(--auth-accent)] underline-offset-4 hover:underline">개인정보처리방침</Link>을 따릅니다.
      </p>

      <h2>제7조 (서비스의 변경·중단)</h2>
      <p>점검·장애·천재지변 등으로 서비스가 일시 중단될 수 있으며, 계획된 점검은 미리 알립니다.</p>

      <h2>제8조 (책임의 제한)</h2>
      <p>운영자는 고의 또는 중대한 과실이 없는 한, 이용자가 계정을 잘못 관리하거나 사업장이 데이터를 잘못 입력해 생긴 손해에 책임지지 않습니다.</p>

      <h2>제9조 (이용 종료)</h2>
      <p>이용자는 언제든지 이용을 끝낼 수 있고, 사업장은 이용자의 권한을 회수할 수 있습니다. 이 약관을 중대하게 어기면 이용이 제한될 수 있습니다.</p>

      <h2>제10조 (준거법과 분쟁)</h2>
      <p>이 약관은 대한민국 법에 따르며, 분쟁은 민사소송법상 관할 법원에서 해결합니다.</p>

      <h2>부칙</h2>
      <p>이 약관은 {LEGAL.effectiveDate}부터 시행합니다.</p>
    </LegalDoc>
  );
}
