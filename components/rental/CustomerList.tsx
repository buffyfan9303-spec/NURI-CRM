"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Lock } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { createCustomer } from "@/lib/domain/rental-actions";
import type { CustomerRow } from "@/lib/domain/rental-types";
import { Pager, usePager, FilterRow, SearchBox, TextAction, Alert, TABLE, THEAD, TH, TR_CLICK, TD, PILL, CELL_LINK } from "./listkit";
import { TableOrCards, MobileCard } from "@/components/ui/ResponsiveTable";
import { AddressInput } from "@/components/common/AddressInput";
import { useUrlParam, useUrlSorting } from "@/lib/table/useUrlTable";
import { useSortedRows } from "@/lib/table/useSortedRows";
import { SortableTh } from "@/components/table/SortableTh";

export interface CustomerActivity {
  lastVisit: string | null;
  nextVisit: string | null;
  openCount: number;
}

const PAGE_SIZE = 20;

export function CustomerList({
  businessId,
  canWrite,
  canReadPii,
  customers,
  activity,
}: {
  businessId: string;
  canWrite: boolean;
  canReadPii: boolean;
  customers: CustomerRow[];
  activity: Record<string, CustomerActivity>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = useUrlParam("q");
  const [sorting, setSorting] = useUrlSorting();

  const needle = q.trim();
  const filtered = needle
    ? customers.filter((c) => c.name.includes(needle) || (c.phone ?? "").includes(needle))
    : customers;

  const { sortedRows, getColumn } = useSortedRows<CustomerRow>(
    filtered,
    {
      name: (c) => c.name,
      lastVisit: (c) => activity[c.id]?.lastVisit ?? "",
      nextVisit: (c) => activity[c.id]?.nextVisit ?? "",
      createdAt: (c) => c.createdAt,
    },
    sorting,
    setSorting
  );
  const { page, setPage, totalPages, pageRows } = usePager(sortedRows, PAGE_SIZE);
  React.useEffect(() => setPage(1), [needle, sorting, setPage]);

  // 표와 카드가 같은 값·같은 동작을 쓰도록 한 곳에서 계산한다.
  const openRow = (c: CustomerRow) => router.push(`/w/${businessId}/customers/${c.id}`);
  const rowView = (c: CustomerRow) => {
    const a = activity[c.id];
    return {
      href: `/w/${businessId}/customers/${c.id}`,
      phone: c.phone ? (
        <span className="tabular-nums">{c.phone}</span>
      ) : c.hasPhone === false ? (
        <span className="text-t3">등록 없음</span>
      ) : c.hasPhone === true ? (
        <span className="inline-flex items-center gap-1 text-t3"><Lock size={11} aria-hidden />비공개</span>
      ) : (
        <span className="text-t3">-</span>
      ),
      lastVisit: a?.lastVisit ? formatInTz(a.lastVisit, DEFAULT_TZ, "yyyy.MM.dd") : "-",
      nextVisit: a?.nextVisit ? formatInTz(a.nextVisit, DEFAULT_TZ, "yyyy.MM.dd") : "-",
      open: a && a.openCount > 0 ? `진행 ${a.openCount}건` : "-",
      createdAt: formatInTz(c.createdAt, DEFAULT_TZ, "yyyy.MM.dd"),
      tags: c.tags.length > 0 ? c.tags.map((t) => <span key={t} className={PILL}>{t}</span>) : null,
    };
  };

  return (
    <>
      <PageHeader
        title="고객"
        description={
          canReadPii
            ? "연락처·방문 이력을 확인합니다. 신체 치수는 고객 상세에서 관리합니다."
            : "고객 개인정보 조회(pii.read) 권한이 없어 이름·태그·방문 이력만 표시됩니다."
        }
        meta={<span className={PILL}>{customers.length}명</span>}
        actions={
          <Button
            onClick={() => setOpen(true)}
            disabled={!canWrite}
            title={canWrite ? undefined : "고객 등록 권한(write)이 없습니다. 사업장 관리자에게 요청하세요."}
          >
            <Plus size={15} aria-hidden />
            신규 등록
          </Button>
        }
      >
        {customers.length > 0 && (
          <FilterRow>
            <SearchBox value={q} onChange={setQ} placeholder="이름 또는 전화번호 검색" />
          </FilterRow>
        )}
      </PageHeader>

      {customers.length === 0 ? (
        <Card>
          <EmptyState
            title="등록된 고객이 없습니다."
            description="신규 등록 버튼으로 첫 고객을 추가하세요."
            action={canWrite && <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} aria-hidden />신규 등록</Button>}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="검색 결과가 없습니다."
            description={`'${needle}'과 일치하는 고객이 없습니다.`}
            action={<TextAction onClick={() => setQ("")}>검색 지우기</TextAction>}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <TableOrCards
            rows={pageRows}
            keyOf={(c) => c.id}
            table={
              <Card className="overflow-x-auto">
                <table className={`${TABLE} min-w-[860px]`}>
                  <thead>
                    <tr className={THEAD}>
                      <SortableTh column={getColumn("name")} label="이름" className={TH} />
                      <th className={TH}>연락처</th>
                      <SortableTh column={getColumn("lastVisit")} label="최근 방문" className={TH} />
                      <SortableTh column={getColumn("nextVisit")} label="다음 방문" className={TH} />
                      <th className={TH}>진행 업무</th>
                      <th className={TH}>태그</th>
                      <SortableTh column={getColumn("createdAt")} label="등록일" className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((c) => {
                      const v = rowView(c);
                      return (
                        <tr key={c.id} onClick={() => openRow(c)} className={`${TR_CLICK} h-[52px]`}>
                          <td className={`${TD} font-medium text-t`}>
                            <Link href={v.href} className={`${CELL_LINK} max-w-[180px]`} title={c.name} onClick={(e) => e.stopPropagation()}>
                              {c.name}
                            </Link>
                          </td>
                          <td className={`${TD} text-t2`}>{v.phone}</td>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{v.lastVisit}</td>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{v.nextVisit}</td>
                          <td className={`${TD} text-t2`}>{v.open}</td>
                          <td className={TD}><span className="flex flex-wrap gap-1">{v.tags ?? <span className="text-t3">-</span>}</span></td>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t3`}>{v.createdAt}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            }
            card={(c) => {
              const v = rowView(c);
              const a = activity[c.id];
              // 휴대폰 카드(C8): 이름 + 연락처(탭=전화) 한 줄, 값 있는 다음 방문·진행만. "-"·최근 방문·등록일은 상세에서.
              const fields: [string, React.ReactNode][] = [];
              if (a?.nextVisit) fields.push(["다음 방문", v.nextVisit]);
              if (a && a.openCount > 0) fields.push(["진행 업무", `${a.openCount}건`]);
              return (
                <MobileCard
                  title={c.name}
                  sub={v.tags ?? undefined}
                  badge={
                    c.phone ? (
                      <a
                        href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                        onClick={(e) => e.stopPropagation()}
                        className="-my-3 inline-flex min-h-[44px] items-center px-1 text-[12.5px] tabular-nums text-[var(--accent-ink)] underline-offset-2 hover:underline"
                        aria-label={`${c.name}에게 전화 ${c.phone}`}
                      >
                        {c.phone}
                      </a>
                    ) : c.hasPhone === true ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-t3"><Lock size={11} aria-hidden />비공개</span>
                    ) : undefined
                  }
                  onClick={() => openRow(c)}
                  fields={fields.length > 0 ? fields : undefined}
                />
              );
            }}
          />
          <Pager page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
        </div>
      )}

      <NewCustomerModal
        businessId={businessId}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

function NewCustomerModal({
  businessId,
  open,
  onClose,
  onCreated,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [memo, setMemo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // CLICK-PATH-212: 취소 후 다시 열면 이전 입력이 남지 않게 open 전환 시 초기화.
  React.useEffect(() => {
    if (open) { setName(""); setPhone(""); setAddress(""); setMemo(""); setError(null); }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      setError("이름을 입력하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await createCustomer(businessId, { name: name.trim(), phone: phone.trim(), address: address.trim(), memo: memo.trim() });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setName("");
    setPhone("");
    setAddress("");
    setMemo("");
    onCreated();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="고객 신규 등록"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button onClick={submit} loading={busy}>
            {busy ? "저장 중…" : "등록"}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {error && <Alert className="mb-3">{error}</Alert>}
        <Input label="이름" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <Input label="전화번호" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" inputMode="tel" />
        <AddressInput label="주소" value={address} onChange={setAddress} />
        <Input label="메모" value={memo} onChange={(e) => setMemo(e.target.value)} wrapperClassName="mb-0" />
      </form>
    </Modal>
  );
}
