"use client";

/**
 * UI 프리미티브 + 인증 화면 시연 페이지.
 * 인증 없이 접근 가능(App 그룹 밖). 대비 검증 및 상태별(로딩/빈/오류/비활성/권한없음) 육안 확인용.
 * 더미 props만 사용 — 실제 데이터 페칭 없음.
 */
import * as React from "react";
import {
  Factory,
  Shirt,
  Store,
  Scissors,
  School,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginCard } from "@/components/auth/LoginCard";
import { IndustryPicker, type IndustryOption } from "@/components/auth/IndustryPicker";
import { BusinessPicker } from "@/components/auth/BusinessPicker";
import { SignupCard } from "@/components/auth/SignupCard";
import { ResetPasswordCard } from "@/components/auth/ResetPasswordCard";
import { PendingApprovalCard } from "@/components/auth/PendingApprovalCard";

const INDUSTRIES: IndustryOption[] = [
  { key: "factory", name: "의류공장", icon: Factory, desc: "생산·발주·원단 관리" },
  { key: "rental", name: "의류렌탈", icon: Shirt, desc: "대여·반납·보증금 관리" },
  { key: "unmanned", name: "무인매장", icon: Store, desc: "재고·결제·출입 관리" },
  { key: "salon", name: "미용실", icon: Scissors, desc: "예약·고객·시술 이력" },
  { key: "academy", name: "학원", icon: School, desc: "수강생·출결·수납 관리" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-t3">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf p-4">
      <div className="mb-2 text-[11px] font-semibold text-t3">{label}</div>
      {children}
    </div>
  );
}

export default function UiPreviewPage() {
  const [industry, setIndustry] = React.useState<string | null>("factory");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);

  return (
    <div className="min-h-screen bg-bg px-6 py-10 text-t">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">UI 프리뷰 — NURI CRM</h1>
          <p className="text-[13px] text-t2">
            컴포넌트별 loading / empty / error / disabled / 권한없음 상태를 한 화면에서 확인합니다.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Button">
        <Row label="variant × size">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </Row>
        <Row label="loading (중복 제출 차단) / disabled">
          <div className="flex flex-wrap items-center gap-3">
            <Button loading>저장 중…</Button>
            <Button disabled>비활성 (콜백 없음)</Button>
          </div>
        </Row>
      </Section>

      <Section title="Input / PasswordInput">
        <Row label="기본 / 필수 / 힌트">
          <Input label="이름" placeholder="홍길동" />
          <Input label="이메일" required hint="사업장에 등록된 이메일을 입력하세요." />
        </Row>
        <Row label="오류 상태">
          <Input label="이메일" required error="올바른 이메일 형식이 아닙니다." defaultValue="not-an-email" />
        </Row>
        <Row label="비활성">
          <Input label="사업자번호" disabled defaultValue="계산 중…" />
        </Row>
        <Row label="비밀번호(표시/숨김 토글)">
          <PasswordInput label="비밀번호" defaultValue="hunter2" />
        </Row>
      </Section>

      <Section title="Badge / Spinner">
        <Row label="상태 뱃지 — 색상만이 아니라 아이콘+텍스트">
          <div className="flex flex-wrap gap-2">
            <Badge kind="success">승인됨</Badge>
            <Badge kind="warning">대기중</Badge>
            <Badge kind="info">안내</Badge>
            <Badge kind="error">거절됨</Badge>
          </div>
        </Row>
        <Row label="Spinner">
          <Spinner />
        </Row>
      </Section>

      <Section title="상태 컴포넌트 — Loading / Empty / Error / Forbidden (서로 다른 3+1가지)">
        <Row label="LoadingState">
          <LoadingState />
        </Row>
        <Row label="EmptyState (정상, 결과 0건)">
          <EmptyState
            title="등록된 고객이 없습니다."
            description="새 고객을 등록하면 이곳에 표시됩니다."
          />
        </Row>
        <Row label="ErrorState (재시도 콜백)">
          <ErrorState
            description="네트워크 오류로 목록을 불러오지 못했습니다."
            onRetry={() => {
              setRetrying(true);
              setTimeout(() => setRetrying(false), 900);
            }}
            retrying={retrying}
          />
        </Row>
        <Row label="ForbiddenState (권한없음)">
          <ForbiddenState />
        </Row>
      </Section>

      <Section title="Modal (포커스 트랩 / Escape / 스크롤 잠금 / 트리거 포커스 복귀)">
        <Row label="열기 버튼을 눌러 확인">
          <Button onClick={() => setModalOpen(true)}>모달 열기</Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="직원 삭제 확인"
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  취소
                </Button>
                <Button variant="danger" onClick={() => setModalOpen(false)}>
                  삭제
                </Button>
              </>
            }
          >
            <p className="text-[13px] text-t2">
              이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?
            </p>
          </Modal>
        </Row>
      </Section>

      <Section title="IndustryPicker (role=radiogroup, 방향키 탐색)">
        <Row label="선택 상태 유지">
          <IndustryPicker industries={INDUSTRIES} value={industry} onChange={setIndustry} />
        </Row>
      </Section>

      <Section title="BusinessPicker">
        <Row label="정상 목록">
          <Card className="p-4">
            <BusinessPicker
              businesses={[
                { id: "1", name: "누리 공장 본점", industry: "factory", role: "owner", memberCount: 12 },
                { id: "2", name: "누리 렌탈 강남점", industry: "rental", role: "manager", memberCount: 4 },
              ]}
              onPick={() => {}}
            />
          </Card>
        </Row>
        <Row label="loading">
          <Card className="p-4">
            <BusinessPicker businesses={[]} onPick={() => {}} loading />
          </Card>
        </Row>
        <Row label="error (재시도)">
          <Card className="p-4">
            <BusinessPicker
              businesses={[]}
              onPick={() => {}}
              error="사업장 목록을 불러오지 못했습니다."
              onRetry={() => {}}
            />
          </Card>
        </Row>
        <Row label="empty (소속 사업장 없음 — 초대·가입 안내, 오류와 구분)">
          <Card className="p-4">
            <BusinessPicker businesses={[]} onPick={() => {}} />
          </Card>
        </Row>
      </Section>

      <Section title="인증 화면 (AuthShell 안에서 실제 배치 — 각 480px 높이로 잘라서 미리본다)">
        <Row label="LoginCard — 기본">
          <div className="h-[560px] overflow-hidden rounded-[var(--r-xl)]">
            <AuthShell>
              <LoginCard onSubmit={() => {}} onForgot={() => {}} onSignup={() => {}} />
            </AuthShell>
          </div>
        </Row>
        <Row label="LoginCard — 오류 + 안내(notice) + loading">
          <div className="h-[640px] overflow-hidden rounded-[var(--r-xl)]">
            <AuthShell>
              <LoginCard
                onSubmit={() => {}}
                onForgot={() => {}}
                onSignup={() => {}}
                notice="비밀번호를 재설정했습니다. 새 비밀번호로 로그인하세요."
                error="이메일 또는 비밀번호가 올바르지 않습니다."
                loading
              />
            </AuthShell>
          </div>
        </Row>
        <Row label="SignupCard">
          <div className="h-[720px] overflow-hidden rounded-[var(--r-xl)]">
            <AuthShell>
              <SignupCard onSubmit={() => {}} onLogin={() => {}} />
            </AuthShell>
          </div>
        </Row>
        <Row label="ResetPasswordCard — 폼 / 발송완료">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-[520px] overflow-hidden rounded-[var(--r-xl)]">
              <AuthShell>
                <ResetPasswordCard onSubmit={() => {}} onBackToLogin={() => {}} />
              </AuthShell>
            </div>
            <div className="h-[520px] overflow-hidden rounded-[var(--r-xl)]">
              <AuthShell>
                <ResetPasswordCard onSubmit={() => {}} onBackToLogin={() => {}} sent />
              </AuthShell>
            </div>
          </div>
        </Row>
        <Row label="PendingApprovalCard">
          <div className="h-[480px] overflow-hidden rounded-[var(--r-xl)]">
            <AuthShell>
              <PendingApprovalCard
                email="owner@example.com"
                businessName="누리 공장 본점"
                onLogout={() => {}}
                onRefresh={() => {}}
              />
            </AuthShell>
          </div>
        </Row>
      </Section>
    </div>
  );
}
