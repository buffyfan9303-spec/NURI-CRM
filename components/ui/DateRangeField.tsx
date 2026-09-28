"use client";

/**
 * 기간(날짜 범위) 선택 — react-day-picker range 모드를 Modal 안에 넣는다.
 * PC 는 가운데 다이얼로그(두 달), 휴대폰은 하단 시트(한 달, Modal 이 vaul 로 처리). 시간은 호출부가 따로 받는다.
 * 값은 "yyyy-MM-dd" 문자열 두 개 — 폼의 datetime-local 문자열과 바로 이어 붙일 수 있게.
 * 공휴일: lib/holidays(useHolidayMap) 로 ±1년 범위를 읽어 일요일처럼 빨간 글자 + 날짜 aria-label 에 이름을 붙인다.
 */
import * as React from "react";
import { DayPicker, labelDayButton, type DateRange } from "react-day-picker";
import { ko } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { CalendarDays } from "@/lib/icons";
import { useHolidayMap } from "@/lib/holidays";
import { cn } from "@/lib/utils/cn";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { usePhone } from "./useDialogA11y";

const pad = (n: number) => String(n).padStart(2, "0");
export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDateKey = (k: string): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
};
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const label = (k: string) => {
  const d = fromDateKey(k);
  return d ? `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${WEEKDAY[d.getDay()]})` : "";
};
const nights = (a: string, b: string) => {
  const x = fromDateKey(a), y = fromDateKey(b);
  return x && y ? Math.round((y.getTime() - x.getTime()) / 86400000) : 0;
};

// 앱 토큰으로 react-day-picker 변수를 덮는다(테마 토글과 같이 바뀐다). 셀 40px(PC)·44px(터치)는 아래 클래스.
const RDP_STYLE = {
  "--rdp-accent-color": "var(--accent-strong)",
  "--rdp-accent-background-color": "var(--accent-soft)",
  "--rdp-range_start-color": "var(--accent-contrast)",
  "--rdp-range_end-color": "var(--accent-contrast)",
  "--rdp-range_middle-color": "var(--accent-ink)",
  "--rdp-today-color": "var(--accent-ink)",
  "--rdp-day-width": "40px",
  "--rdp-day-height": "40px",
  "--rdp-day_button-width": "38px",
  "--rdp-day_button-height": "38px",
  "--rdp-day_button-border-radius": "10px",
  "--rdp-months-gap": "24px",
  "--rdp-nav_button-width": "36px",
  "--rdp-nav_button-height": "36px",
  "--rdp-weekday-opacity": "1",
  "--rdp-outside-opacity": "0.45",
  "--rdp-animation_duration": "0s",
  fontSize: "13px",
} as React.CSSProperties;

export function DateRangeField({
  label: fieldLabel,
  from,
  to,
  onChange,
  required,
  className,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>();
  const phone = usePhone();
  const id = React.useId();
  // 공휴일 맵은 열렸을 때만(빈 배열이면 훅이 조회하지 않는다). 예약 달력이 오가는 범위 ±1년.
  const holidayRange = React.useMemo(() => {
    if (!open) return [];
    const y = new Date().getFullYear();
    return [`${y - 1}-01-01`, `${y + 1}-12-31`];
  }, [open]);
  const holidays = useHolidayMap(holidayRange);

  const openPicker = () => {
    setDraft({ from: fromDateKey(from), to: fromDateKey(to) });
    setOpen(true);
  };
  const close = React.useCallback(() => setOpen(false), []);
  const apply = () => {
    if (!draft?.from) return;
    onChange(toDateKey(draft.from), toDateKey(draft.to ?? draft.from));
    setOpen(false);
  };

  // 버튼 요약은 같은 해면 반납일의 연도를 생략해 좁은 열(1024 3열)에서도 잘리지 않게 한다.
  const summary = from && to ? `${label(from)} → ${to.slice(0, 4) === from.slice(0, 4) ? label(to).slice(5) : label(to)}` : from ? `${label(from)} → 반납일 선택` : "";
  const n = from && to ? nights(from, to) : 0;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={id} className="text-[length:var(--fs-body)] font-medium text-t2">
        {fieldLabel} {required && <span className="text-et" aria-hidden>*</span>}
      </span>
      <button
        type="button"
        onClick={openPicker}
        aria-labelledby={id}
        aria-haspopup="dialog"
        className="flex h-[40px] w-full items-center gap-2 rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-left text-[16px] text-t outline-none transition-colors hover:bg-sf2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:text-[13.5px] [@media(pointer:coarse)]:h-[44px]"
      >
        <CalendarDays size={16} className="shrink-0 text-t3" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate", !summary && "text-t3")}>{summary || "달력에서 기간 선택"}</span>
        {n > 0 && <span className="shrink-0 rounded-full bg-sf2 px-2 py-0.5 text-[11.5px] text-t2">{n}박</span>}
      </button>

      <Modal
        open={open}
        onClose={close}
        title={fieldLabel}
        className="sm:max-w-[640px]"
        footer={
          <>
            <Button variant="secondary" onClick={close}>취소</Button>
            <Button onClick={apply} disabled={!draft?.from}>
              {draft?.from && !draft.to ? "하루만 적용" : "적용"}
            </Button>
          </>
        }
      >
        <p className="mb-2 text-[length:var(--fs-meta)] text-t2" aria-live="polite">
          {draft?.from
            ? draft.to
              ? `${label(toDateKey(draft.from))} → ${label(toDateKey(draft.to))} · ${nights(toDateKey(draft.from), toDateKey(draft.to))}박`
              : `${label(toDateKey(draft.from))} 부터 — 반납일을 누르세요`
            : "대여일을 먼저 누르고 반납일을 누르세요."}
        </p>
        <DayPicker
          mode="range"
          locale={ko}
          weekStartsOn={0}
          numberOfMonths={phone ? 1 : 2}
          defaultMonth={draft?.from ?? new Date()}
          selected={draft}
          onSelect={setDraft}
          showOutsideDays={false}
          style={RDP_STYLE}
          modifiers={{
            sunday: { dayOfWeek: [0] },
            saturday: { dayOfWeek: [6] },
            holiday: (d) => !!holidays[toDateKey(d)],
          }}
          labels={{
            labelDayButton: (d, m, o, lib) => {
              const h = holidays[toDateKey(d)];
              return h ? `${labelDayButton(d, m, o, lib)} ${h}` : labelDayButton(d, m, o, lib);
            },
          }}
          modifiersClassNames={{
            sunday: "[&:not([data-selected])>button]:text-et",
            saturday: "[&:not([data-selected])>button]:text-it",
            holiday: "rdp-holiday [&:not([data-selected])>button]:!text-et",
          }}
          classNames={{
            root: "rdp-root mx-auto w-fit max-w-full text-t [&_.rdp-day>button]:[@media(pointer:coarse)]:h-[42px] [&_.rdp-day>button]:[@media(pointer:coarse)]:w-[42px] [&_.rdp-day]:[@media(pointer:coarse)]:h-[44px] [&_.rdp-day]:[@media(pointer:coarse)]:w-[44px]",
            month_caption: "rdp-month_caption text-[14px] font-semibold text-t",
            weekday: "rdp-weekday text-[12px] font-medium text-t3",
            nav: "rdp-nav [&>button]:rounded-[var(--r-sm)] [&>button]:text-t2 [&>button:hover]:bg-sf2",
          }}
        />
        <p className="mt-2 text-[11.5px] text-t3">빨강 = 일요일·공휴일, 파랑 = 토요일</p>
      </Modal>
    </div>
  );
}
