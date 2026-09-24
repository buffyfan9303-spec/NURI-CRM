/**
 * 인증된 영역의 공통 셸 — Sidebar + Main + 전역 CustomerDetailPanel.
 * 디테일 패널은 한 곳에 마운트되어 customerDetailStore 를 구독한다.
 */
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { CustomerDetailPanel } from "@/components/customer/CustomerDetailPanel";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-sf">
          {children}
        </main>
      </div>
      <CustomerDetailPanel />
    </AuthGuard>
  );
}
