"use client";

import Link from "next/link";
import { Pencil, Trash2, Repeat, ExternalLink, Lock } from "@/lib/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { CalendarEvent, MemberOption } from "@/lib/domain/calendar-shared";
import { isDerivedEvent, STATUS_LABEL } from "@/lib/domain/calendar-shared";
import type { IndustryDef } from "@/lib/industry/config";
import { kindTagClass, kindLabel, statusBadgeKind, memberLabel, formatEventTimeLabel, sourceLinkPath } from "./shared";

export function EventDetail({
  event,
  tz,
  industry,
  businessId,
  members,
  busy,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  tz: string;
  industry: IndustryDef;
  businessId: string;
  members: MemberOption[];
  busy?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const derived = isDerivedEvent(event);
  const linkPath = derived ? sourceLinkPath(businessId, event.sourceTable) : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={`ev-tag ${kindTagClass(event.kind, industry.eventKinds)}`}>
            {kindLabel(event.kind, industry.eventKinds)}
          </span>
          <h3 className="mt-1.5 break-words text-[15px] font-semibold text-t">{event.title}</h3>
        </div>
        <Badge kind={statusBadgeKind(event.status)}>{STATUS_LABEL[event.status] ?? event.status}</Badge>
      </div>

      <dl className="grid grid-cols-[64px_1fr] gap-y-2 text-[13px]">
        <dt className="text-t3">일시</dt>
        <dd className="text-t">{formatEventTimeLabel(event, tz)}</dd>
        <dt className="text-t3">담당자</dt>
        <dd className="text-t">{memberLabel(event.assignee, members)}</dd>
        {event.notes && (
          <>
            <dt className="text-t3">메모</dt>
            <dd className="whitespace-pre-wrap text-t">{event.notes}</dd>
          </>
        )}
      </dl>

      {event.recurrenceId && (
        <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 p-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-t2">
            <Repeat size={14} aria-hidden />
            반복 일정
          </p>
          <div
            className="mt-2 flex gap-2"
            title="반복 일정 전개(회차별 분리 수정)는 아직 구현되지 않았습니다. 서버 전개 로직이 추가되면 활성화됩니다."
          >
            <Button variant="secondary" size="sm" disabled className="flex-1">
              이 회차만
            </Button>
            <Button variant="secondary" size="sm" disabled className="flex-1">
              이후 전체
            </Button>
          </div>
        </div>
      )}

      {derived ? (
        <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-ib p-3 text-[12.5px] text-it">
          <p className="flex items-center gap-1.5 font-medium">
            <Lock size={14} aria-hidden />
            원 업무에서 만들어진 일정입니다
          </p>
          <p className="mt-1 leading-relaxed">
            날짜·담당자·상태 변경은 캘린더가 아니라 원 업무 화면에서 해야 원거래와 어긋나지 않습니다.
          </p>
          {linkPath ? (
            <Link
              href={linkPath}
              className="mt-2 inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              원 업무로 이동 <ExternalLink size={13} aria-hidden />
            </Link>
          ) : (
            <p className="mt-2 text-t3">
              원 업무 화면 경로를 자동으로 찾지 못했습니다({event.sourceTable ?? "미상"}). 해당 메뉴에서 직접
              확인하세요.
            </p>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          {/* 결함 #4와 같은 클래스: write/delete 없는 사용자에게도 노출되던 수정·삭제 버튼을 비활성+툴팁으로. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={onEdit}
            disabled={busy || !canEdit}
            title={canEdit ? undefined : "일정 수정 권한(write)이 없습니다."}
            className="flex-1"
          >
            <Pencil size={15} aria-hidden />
            수정
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onDelete}
            loading={busy}
            disabled={!canDelete}
            title={canDelete ? undefined : "일정 삭제 권한(delete)이 없습니다."}
            className="flex-1"
          >
            <Trash2 size={15} aria-hidden />
            취소
          </Button>
        </div>
      )}
    </div>
  );
}
