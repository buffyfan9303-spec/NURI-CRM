import type { Config } from "tailwindcss";

/**
 * NURI CRM Tailwind 설정.
 * 모든 색상 토큰은 globals.css의 CSS 변수(§5.3 의미 토큰)를 가리킨다.
 *
 * 사용 예: bg-bg, text-t, border-bd, text-accent-ink, bg-okb, text-okt …
 */

/**
 * CSS 변수 토큰을 **opacity modifier(`bg-sf2/40`)까지 동작하는** 색으로 만든다.
 *
 * 그냥 `sf2: "var(--sf2)"` 로 두면 Tailwind 가 알파를 주입할 자리가 없어
 * `bg-sf2/40` 같은 클래스가 **빈 규칙으로 조용히 사라진다**(테두리가 안 보이거나
 * 배경이 투명해진다). 실제로 캘린더·정산 화면에서 그렇게 무효인 클래스가 발견됐다.
 *
 * 호출부를 하나씩 고치는 대신 토큰 정의 한 곳에서 해결한다:
 * modifier 가 없으면 변수 그대로, 있으면 color-mix 로 합성한다.
 */
type ColorValue = Config["theme"] extends infer T
  ? T extends { extend?: { colors?: infer C } }
    ? C extends Record<string, infer V>
      ? V
      : never
    : never
  : never;

const tok = (name: string) =>
  // Tailwind 는 색 값으로 `({ opacityValue }) => string` 함수를 받지만
  // 타입 정의(RecursiveKeyValuePair)가 문자열만 허용해 as 로 맞춘다. 동작은 정상이다.
  (({ opacityValue }: { opacityValue?: string }) => {
    // ⚠ modifier 가 없는 클래스(`bg-sf`)에도 Tailwind 는 opacityValue 를 넘긴다 —
    //   `undefined` 가 아니라 **문자열 `"var(--tw-bg-opacity)"`** 다.
    //   예전 코드는 `undefined` 만 정상으로 보고 나머지를 Number() 로 바꿔 `NaN%` 를 만들었고,
    //   CSS 파서가 그 선언을 통째로 버려서 **bg-sf·bg-nav·text-t 가 아무 색도 칠하지 않았다.**
    //   그래서 "숫자로 변환되는가"로 판정한다.
    const n = Number(opacityValue);
    return Number.isFinite(n)
      ? `color-mix(in srgb, var(--${name}) ${n * 100}%, transparent)`
      : `var(--${name})`;
  }) as unknown as ColorValue;

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  // 테마 계약: 첫 paint 전에 <html data-theme="dark">가 확정되고,
  // 기존 body.dk 클래스(hydrate 후 스토어가 붙임)도 회귀 방지를 위해 함께 매칭한다.
  // 다만 우리는 CSS 변수 기반이므로 dark: 변형은 거의 사용하지 않는다.
  darkMode: ["selector", ':is(body.dk, [data-theme="dark"]) &'],
  theme: {
    // 텍스트 색 키 `t` 가 border 색으로도 생성되면 `border-t`(윗선 두께)가 border-color:var(--t) 까지 얹어
    // 모든 윗선을 글자색으로 칠한다(표 행 구분선 검정·사이드바 흰 선). 테두리 색에서만 `t` 를 뺀다.
    borderColor: ({ theme }) => {
      const { t: _t, ...rest } = theme("colors") as Record<string, unknown>;
      return { ...rest, DEFAULT: theme("colors.gray.200", "currentColor") } as never;
    },
    extend: {
      colors: {
        // 배경 / 표면
        bg: tok("bg"),
        sf: tok("sf"),
        sf2: tok("sf2"),
        sf3: tok("sf3"),

        // 보더
        bd: tok("bd"),
        bd2: tok("bd2"),

        // §5.3 신규 의미 토큰
        nav: tok("nav"),
        "nav-bd": tok("nav-bd"),
        "nav-active": tok("nav-active"),
        topbar: tok("topbar"),
        sel: tok("sel"),
        // 인증 세계(reference-03). auth-bar 는 중단된 이미지02 전용이라 제거했다.
        "auth-tx2": tok("auth-tx2"),
        "auth-tx": tok("auth-tx"),
        "auth-field-bd": tok("auth-field-bd"),
        "auth-field": tok("auth-field"),
        "auth-input-bd": tok("auth-input-bd"),
        "auth-page": tok("auth-page"),
        "auth-frame": tok("auth-frame"),
        "auth-cta-hover": tok("auth-cta-hover"),
        "auth-cta-tx": tok("auth-cta-tx"),
        "auth-cta": tok("auth-cta"),
        "auth-accent": tok("auth-accent"),
        "auth-disabled": tok("auth-disabled"),
        "auth-art": tok("auth-art"),
        "auth-error": tok("auth-error"),
        "ch-5": tok("ch-5"),
        "ch-4": tok("ch-4"),
        "ch-3": tok("ch-3"),
        "ch-2": tok("ch-2"),
        "ch-1": tok("ch-1"),
        focusring: tok("focus"),

        // 텍스트
        t: tok("t"),
        t2: tok("t2"),
        t3: tok("t3"),

        // 브랜드
        acc: tok("acc"),
        gold: tok("gold"),
        accent: tok("accent"),
        "accent-strong": tok("accent-strong"),
        "accent-hover": tok("accent-hover"),
        "accent-contrast": tok("accent-contrast"),
        "accent-ink": tok("accent-ink"),
        "accent-soft": tok("accent-soft"),

        // 상태 색 (배경/텍스트 쌍)
        okb: tok("okb"),
        okt: tok("okt"),
        wb: tok("wb"),
        wt: tok("wt"),
        ib: tok("ib"),
        it: tok("it"),
        eb: tok("eb"),
        et: tok("et"),

        // 사이드바
        sbg: tok("sbg"),
        sbt: tok("sbt"),
        sbt2: tok("sbt2"),
        sbsec: tok("sbsec"),
      },
      fontFamily: {
        // globals.css 의 html/body 스택과 **같은 값**이어야 한다. 어긋나면 font-sans 를 명시한
        // 요소만 한글 글꼴이 달라진다.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Apple SD Gothic Neo",
          "Segoe UI",
          "Malgun Gothic",
          "맑은 고딕",
          "Noto Sans KR",
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        // 기존 코드의 자주 쓰이는 크기를 유틸로 노출
        "2xs": "9px",
        "3xs": "10px",
      },
      boxShadow: {
        // 디자인 폴리시 v2/v3에서 자주 쓰던 그림자
        card: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)",
        "card-hover": "0 6px 22px rgba(0,0,0,.12)",
        topbar: "0 1px 0 var(--bd), 0 2px 8px rgba(0,0,0,.05)",
        panel: "-6px 0 32px rgba(0,0,0,.18)",
        // 테마별 값은 globals.css 의 --sh-modal 이 갖는다(다크에서 더 깊게).
        modal: "var(--sh-modal)",
      },
      // ⚠ borderRadius 의 sm/md/lg/xl 은 덮어쓰지 않는다 — 기존 화면이 Tailwind 기본 rounded-lg(8px) 등을
      //   그대로 쓰고 있어 토큰(16px)으로 바꾸면 전 화면이 한꺼번에 둥글어진다. 토큰은 rounded-[var(--r-md)] 로 쓴다.
      spacing: {
        touch: "var(--touch)",
        ctl: "var(--ctl)",
        topbar: "var(--topbar-h)",
        page: "var(--page-x)",
      },
      keyframes: {
        sheetUp: { from: { opacity: "0", transform: "translateY(24px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        "sheet-up": "sheetUp 200ms cubic-bezier(.2,.8,.2,1)",
        "fade-in": "fadeIn 150ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
