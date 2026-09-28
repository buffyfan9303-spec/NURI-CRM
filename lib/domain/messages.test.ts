/**
 * `scripts/test-messages.mjs`의 검사를 vitest로 옮긴 것(기존 스크립트는 그대로 둔다).
 * lib/domain/messages.ts 자체 검증 — 사업장명·고객명·일시·금액 포함, 금액 null이면 금액 문장이 빠지는지.
 */
import { describe, it, expect } from "vitest";
import * as m from "./messages";

describe("rentalReservationNotice", () => {
  it("확정: 사업장·고객·대여/반납 일시·품목·보증금 포함", () => {
    const t = m.rentalReservationNotice(
      {
        businessName: "누리 렌탈",
        customerName: "김하늘",
        periodStartIso: "2026-10-01T01:00:00Z",
        periodEndIso: "2026-10-03T09:00:00Z",
        items: [{ label: "남성 턱시도 100", qty: 1 }, { label: "구두 270", qty: 2 }],
        deposit: 50000,
        rentalFee: 120000,
        lateFeeRule: "1일당 10,000원",
      },
      "confirmed"
    );
    expect(t).toMatch(/\[누리 렌탈\] 김하늘님, 예약이 확정되었습니다\./);
    expect(t).toMatch(/대여: 10월 1일\(목\) 오전 10:00/);
    expect(t).toMatch(/반납: 10월 3일\(토\) 오후 6:00/);
    expect(t).toMatch(/· 구두 270 ×2/);
    expect(t).toMatch(/대여료 120,000원/);
    expect(t).toMatch(/보증금 50,000원/);
    expect(t).toMatch(/연체 시 1일당 10,000원/);
  });

  it("전날: 금액 null이면 금액 문장 자체가 없다", () => {
    const t = m.rentalReservationNotice(
      {
        businessName: "누리 렌탈",
        customerName: null,
        periodStartIso: "2026-10-01T01:00:00Z",
        periodEndIso: "2026-10-03T09:00:00Z",
        items: [{ label: "한복 세트", qty: 1 }],
        deposit: null,
        rentalFee: null,
      },
      "day_before"
    );
    expect(t).toMatch(/고객님, 내일 대여 예정입니다/);
    expect(t).not.toMatch(/원/);
  });
});

describe("rentalOverdueNotice", () => {
  it("연체: 경과일·예상 연체료, 금액 null이면 연체료 문장 없음", () => {
    const t = m.rentalOverdueNotice({ businessName: "누리 렌탈", customerName: "박민수", periodEndIso: "2026-09-20T09:00:00Z", daysLate: 4, lateFee: 40000 });
    expect(t).toMatch(/박민수님, 반납 예정일\(9월 20일\(일\) 오후 6:00\)이 4일 지났습니다/);
    expect(t).toMatch(/예상 연체료는 40,000원/);
    const masked = m.rentalOverdueNotice({ businessName: "누리 렌탈", customerName: "박민수", periodEndIso: "2026-09-20T09:00:00Z", daysLate: 4, lateFee: null });
    expect(masked).not.toMatch(/연체료/);
  });
});

describe("salonReminderNotice", () => {
  it("일시·시술·담당·금액", () => {
    const t = m.salonReminderNotice({ businessName: "누리 헤어", customerName: "이서연", startAtIso: "2026-09-25T05:30:00Z", serviceName: "컷+펌", staffName: "지수", price: 85000 });
    expect(t).toMatch(/\[누리 헤어\] 이서연님/);
    expect(t).toMatch(/일시: 9월 25일\(금\) 오후 2:30/);
    expect(t).toMatch(/시술: 컷\+펌 \(담당 지수\)/);
    expect(t).toMatch(/예상 금액: 85,000원/);
  });
});

describe("academyUnpaidNotice", () => {
  it("보호자 호칭·월·미납액·기한, 금액 null이면 미납액 문장 없음", () => {
    const t = m.academyUnpaidNotice({ businessName: "누리 학원", studentName: "최준호", guardianName: "최영희", period: "2026-09", dueDate: "2026-09-10", outstanding: 250000, account: "국민 123-45" });
    expect(t).toMatch(/최영희님, 안녕하세요/);
    expect(t).toMatch(/2026년 9월 수강료/);
    expect(t).toMatch(/미납액: 250,000원/);
    expect(t).toMatch(/납부 기한: 9월 10일\(목\)/);
    expect(t).toMatch(/입금 계좌: 국민 123-45/);
    const noAmt = m.academyUnpaidNotice({ businessName: "누리 학원", studentName: "최준호", period: "2026-09", dueDate: "2026-09-10", outstanding: null });
    expect(noAmt).toMatch(/최준호 학생 보호자님/);
    expect(noAmt).not.toMatch(/미납액/);
  });
});

describe("academyAttendanceNotice", () => {
  it("날짜·반·상태별 문장", () => {
    const t = m.academyAttendanceNotice({ businessName: "누리 학원", studentName: "정우진", className: "중2 수학", sessionDate: "2026-09-24", status: "결석" });
    expect(t).toMatch(/정우진 학생이 9월 24일\(목\) 중2 수학 수업에 결석하였습니다/);
    expect(t).toMatch(/보강이 필요하시면/);
    const late = m.academyAttendanceNotice({ businessName: "누리 학원", studentName: "정우진", sessionDate: "2026-09-24", status: "지각", note: "10분" });
    expect(late).toMatch(/지각하였습니다/);
    expect(late).toMatch(/메모: 10분/);
  });
});

describe("unmannedExpirySummary", () => {
  it("날짜순 정렬·건수·빈 목록", () => {
    const t = m.unmannedExpirySummary({
      businessName: "누리 무인",
      dateKey: "2026-09-24",
      lots: [
        { productName: "우유 1L", expiryDate: "2026-09-27", qty: 3, unit: "개" },
        { productName: "삼각김밥", expiryDate: "2026-09-25", qty: 5 },
      ],
    });
    expect(t).toMatch(/임박 2건/);
    expect(t.indexOf("삼각김밥")).toBeLessThan(t.indexOf("우유 1L"));
    expect(m.unmannedExpirySummary({ businessName: "누리 무인", dateKey: "2026-09-24", lots: [] })).toMatch(/없습니다/);
  });
});

describe("sms/tel 링크", () => {
  it("숫자만, 플랫폼별 구분자, 빈 번호는 null", () => {
    expect(m.smsHref("010-1234-5678", "안녕", "android")).toBe("sms:01012345678?body=%EC%95%88%EB%85%95");
    expect(m.smsHref("010-1234-5678", "안녕", "ios")).toBe("sms:01012345678&body=%EC%95%88%EB%85%95");
    expect(m.smsHref("", "x")).toBeNull();
    expect(m.telHref("010 1234 5678")).toBe("tel:01012345678");
  });
});
