/**
 * 인증 화면 우측 브랜드 아트 패널 — reference-03 의 §9.2 레이어를 순서대로 쌓는다.
 *
 *   1 바탕/광원 → 2 입체 리본 → 3 가는 격자 → 4 꺾임 선 → 5 하단 scrim → 6 실제 HTML 문구
 *   (7 프레임 밖 후광은 패널이 아니라 AuthShell 이 그린다)
 *
 * 격자가 리본 **위**에 오는 건 원본을 확대해 확인한 순서다 — 리본 본체 위로도 격자 선이 지나간다.
 *
 * 지키는 것:
 *  - 원본 스크린샷을 배경으로 깔거나 글자를 PNG 에 굽지 않는다. 전부 CSS/SVG/HTML 이다.
 *  - 정적이다. Canvas/WebGL/3D 엔진을 쓰지 않고 계속 움직이는 오로라도 만들지 않는다.
 *  - Light/Dark 가 같다. 이 패널은 두 모드에서 같은 깊은 색면을 유지한다(§9.4 허용).
 *
 * 좌표계: viewBox 813×976 은 §8.1 의 "1600×1200 비교 기준" 에서 패널 실측(813×976)과 1:1 이다.
 * 즉 **viewBox 1 단위 = 1600px 화면에서의 1 CSS px** 이라, 격자 48px 과 꺾임 선을 같은 수로 맞출 수 있다.
 *
 * 리본 좌표의 출처: 원본 PNG 의 아트 패널(4800 기준 x2049–4484 · y335–3263)을 **813×976 으로 축소한 뒤**
 * 행·열마다 명도가 0.09 이상 뛰는 지점을 읽어 그대로 viewBox 좌표로 썼다(scripts: scratchpad fix3017/edges*.py).
 * 형태는 좌상단에서 잘려 들어오는 **두꺼운 고리(토러스)** 다:
 *   - 안쪽 벽: x0–194 · y0–115. 가로 그라데이션 하나가 밝은 벽(x45 #c2a6fe)에서 구멍(x176 #150071)까지 이어진다.
 *     오른쪽 경계 (193,0)→(174,60)→(156,88) 가 고리의 근접 테두리라 **크리스프**하고, 그 곡선이 그대로 벽의 아래 경계로 이어진다.
 *   - 몸통(전면): 오른쪽 실루엣이 (327,0)→(319,52)→(296,110)→(250,160)→(184,194) 를 지나 y≈213 에서 왼쪽으로 빠진다.
 *     색은 가로 방향(x20 #7844de → x300 #1a5cb2)이고 세로 변화는 작다.
 */
import * as React from "react";

const VB_W = 813;
const VB_H = 976;

/* 리본 실루엣(원본 실측). BODY 는 전면, WALL 은 안쪽 벽+구멍. 둘 다 -60 까지 넘겨 그려 패널 모서리에 틈이 없게 한다. */
const RIBBON_BODY =
  "M 328 -60 L 327 0 C 326 24 323 40 319 52 C 314 74 306 94 296 110 C 286 126 270 142 250 160 C 232 174 210 184 184 194 C 160 202 130 208 96 211 C 60 213 20 213 -60 213 L -60 -60 Z";
const RIBBON_WALL =
  "M -60 -60 L 194 -60 L 193 0 C 188 24 178 44 174 60 C 172 72 166 82 156 88 C 146 100 132 110 108 115 C 80 117 40 116 0 111 L -60 110 Z";
/* 구멍(가장 어두운 초승달). 오른쪽은 WALL 과 같은 크리스프 곡선, 왼쪽은 위가 넓고 아래로 갈수록 왼쪽으로 기우는
   부드러운 경계 — 원본은 y8 에서 x172 까지 밝다가 y88 에서는 x136 부터 어둡다. 채움의 알파가 이 기울기를 따라 사라진다. */
const RIBBON_HOLE =
  "M 186 -60 L 193 -60 L 193 0 C 188 24 178 44 174 60 C 172 72 166 82 156 88 C 150 93 142 97 134 98 C 137 88 140 78 143 70 C 146 56 150 40 160 20 C 166 10 172 6 176 0 C 182 -12 186 -30 186 -60 Z";

/** 격자 한 칸. 원본 실측(확대 후 환산) 약 49px. §9.2 의 44~56px 범위 안이다. */
const CELL = 48;

/* ── 1. 바탕과 광원 ──────────────────────────────────────────
   우상단 청록, 좌상단 보라, 그 사이 푸른 기운. 아래로 내려가며 --auth-art 로 수렴해
   흰 큰 글자가 읽히게 한다(§9.2-1). 좌상단 보라는 리본이 덮으므로 옅게만 깐다. */
const LIGHT_LAYERS = [
  // ⚠ 이 네 줄은 **표본 몇 개가 아니라 63개 표본의 평균 색차로** 고른 조합이다.
  //   x92% 열만 보고 청록 반경을 줄였더니 그 열은 좋아졌지만 배경 전체 평균이 37.4 → 64.2 로
  //   나빠졌다(패널 전체 표본 측정). 한 곳을 맞추려다 전체를 망치는 전형적인 과적합이라,
  //   여기를 고칠 때는 반드시 scripts 의 패널 비교로 **평균 Δ 가 내려가는지** 확인하고 바꿔라.
  // 우측 중단이 원본보다 밝게 남는다(x92% y30% 원본 L .097 vs 구현 .381). 세로 암전만으로는
  // 왼쪽까지 같이 눌려 전체가 나빠졌다 — 오른쪽 가장자리에만 듣는 어두운 층을 맨 위에 얹는다.
  "radial-gradient(40% 34% at 100% 34%, rgba(30,31,35,.5) 0%, rgba(30,31,35,0) 100%)",
  "radial-gradient(72% 58% at 78% 12%, var(--auth-teal) 0%, rgba(13,226,212,.94) 28%, rgba(16,186,208,.44) 62%, rgba(14,242,229,0) 100%)",
  "radial-gradient(66% 54% at 0% 10%, rgba(132,86,246,.95) 0%, rgba(120,84,236,.36) 52%, rgba(124,77,238,0) 100%)",
  "radial-gradient(80% 62% at 40% 2%, rgba(62,152,240,.85) 0%, rgba(56,140,236,.18) 60%, rgba(48,140,236,0) 82%)",
  "linear-gradient(179deg, rgba(30,31,35,0) 40%, rgba(30,31,35,.5) 58%, rgba(30,31,35,.9) 68%, var(--auth-art) 75%)",
];
const LIGHT_SOURCES = LIGHT_LAYERS.join(",");
/** strip(휴대폰 띠)용 — 마지막 세로 암전 층을 뺀다. 120px 높이에서는 하단 1/4 이 검은 막대로만 보인다. */
const STRIP_SOURCES = LIGHT_LAYERS.slice(1, -1).join(",");

/* ── 3. 격자 ────────────────────────────────────────────────
   밝은 청록 면 위에서는 흰 선이 안 보이고, 어두운 하단에서는 검은 선이 안 보인다.
   그래서 **같은 48px 피치의 두 겹**을 쓰고 각각 세로 마스크로 자기 구역에서만 보이게 한다.
   간격은 두 겹이 같으므로 패널 전체에서 이어져 보인다(§9.2-4의 "간격이 일정"). */
const gridLayer = (line: string) =>
  `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`;

export interface AuthArtProps {
  /** 큰 2~3줄 문구. 줄바꿈 위치를 직접 정하려고 문자열 배열로 받는다. */
  headline: readonly string[];
  description: string;
  /** 세로 태블릿·모바일에서 폼 아래로 내려가는 축약 배너(§10.3). 레이어 구성은 같고 타이포만 줄인다. */
  compact?: boolean;
  /** 휴대폰 상단의 얇은 브랜드 띠 — 문구 없이 리본·광원·격자만. 아트를 통째로 생략하는 대신 쓰는 최소 형태. */
  strip?: boolean;
  /** 넷플릭스형 로그인의 전면 배경 — 모서리 없음·문구 없음. headline/description 은 무시한다. */
  backdrop?: boolean;
}

export function AuthArt({ headline, description, compact = false, strip = false, backdrop = false }: AuthArtProps) {
  // 휴대폰 띠(strip)와 PC 아트가 한 문서에 함께 렌더되므로 SVG id 를 변형별로 분리한다 — 같으면 url(#id) 가 display:none 쪽 정의를 가리켜 리본이 사라진다.
  const uid = backdrop ? "b-" : strip ? "s-" : compact ? "c-" : "f-";
  const radius = backdrop ? "" : strip ? "rounded-[16px]" : "rounded-[32px]";
  return (
    <div className={`relative h-full w-full overflow-hidden bg-auth-art ${radius}`}>
      {/* 1. 바탕/광원 */}
      <div className="absolute inset-0" style={{ background: strip ? STRIP_SOURCES : LIGHT_SOURCES }} aria-hidden />

      {/* 2. 입체 리본 */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMinYMin slice"
        aria-hidden
        focusable="false"
      >
        <defs>
          {/* 몸통(전면) — 813 단위로 축소한 원본을 열마다 읽은 값: x20 #7844de · x120 #5d34ca · x200 #4139bd ·
              x250 #2d46b4 · x300 #1a5cb2 · 실루엣 끝 x320 #164f9f(어두운 테). 즉 **가로 방향**으로 보라→남색이고
              세로 변화는 작다. 좌표를 고정(userSpaceOnUse)해 경로를 고쳐도 색 위치가 흔들리지 않게 한다. */}
          <linearGradient id={`${uid}rbBody`} gradientUnits="userSpaceOnUse" x1="0" y1="90" x2="328" y2="150">
            <stop offset="0%" stopColor="#7a46dc" />
            <stop offset="18%" stopColor="#713fd6" />
            <stop offset="37%" stopColor="#6038cc" />
            <stop offset="55%" stopColor="#4c3ac4" />
            <stop offset="73%" stopColor="#2e43b5" />
            <stop offset="88%" stopColor="#1d55b0" />
            <stop offset="100%" stopColor="#164c9c" />
          </linearGradient>

          {/* 안쪽 벽(고리 속면) — 가로 그라데이션. 원본: x0 #ab88f8 · x45 #c2a6fe(최고 명도) · x100 #8c60fa · x130 #6a40d8 ·
              오른쪽 끝(y90 이후 구멍이 끝난 자리) #4f2cbf. 가장 어두운 구멍은 아래 rbCavity 초승달이 따로 맡는다. */}
          <linearGradient id={`${uid}rbRim`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="194" y2="0">
            <stop offset="0%" stopColor="#ab88f8" />
            <stop offset="22%" stopColor="#c2a6fe" />
            <stop offset="50%" stopColor="#8e62f8" />
            <stop offset="66%" stopColor="#6a40d8" />
            <stop offset="78%" stopColor="#4322b4" />
            <stop offset="100%" stopColor="#3d22b0" />
          </linearGradient>

          {/* 구멍(속 공동) 채움 — 왼쪽 경계가 (172,8)→(138,88) 로 기울어 있어 그 방향과 직각인 축으로 알파를 뺀다
              (축 (0.92,0.39): 두 점 모두 t≈161 에 놓인다). 원본 (176,20) #150071 · (160,20) #27079b. */}
          <linearGradient id={`${uid}rbCavity`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="184" y2="78">
            <stop offset="68%" stopColor="#10006c" stopOpacity="0" />
            <stop offset="76%" stopColor="#12006e" stopOpacity="0.62" />
            <stop offset="83%" stopColor="#12006e" stopOpacity="1" />
            <stop offset="100%" stopColor="#0f007c" stopOpacity="1" />
          </linearGradient>

          {/* 벽 위쪽의 얕은 그늘 — 원본은 y0–24 가 y40–104 보다 한 단계 어둡다(x32: #8857ef vs #bfa1fe).
              채도를 지키려고 회색이 아닌 짙은 보라를 섞는다(회색을 섞으면 #896bd5 처럼 탁해진다 — 실측). */}
          <linearGradient id={`${uid}rbShade`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="44">
            <stop offset="0%" stopColor="#4a1ad8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#4a1ad8" stopOpacity="0" />
          </linearGradient>

          {/* 몸통 상단이 청록 광원을 받아 살짝 밝아지는 층 — (230,40) #4a50c9 가 아래 (240,140) #2e42b5 보다 밝다.
              위/아래 두 층: 위는 옅은 반사, 아래(y150→213)는 원본처럼 조금 어두워진다(x0: y116 #7342d6 → y180 #663dbe). */}
          <linearGradient id={`${uid}rbRoll`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="213">
            <stop offset="0%" stopColor="#7c8cf0" stopOpacity="0.18" />
            <stop offset="40%" stopColor="#7c8cf0" stopOpacity="0" />
            <stop offset="70%" stopColor="#2a1080" stopOpacity="0" />
            <stop offset="100%" stopColor="#2a1080" stopOpacity="0.28" />
          </linearGradient>

          {/* 본체의 아주 옅은 사선 결. 원본에도 45° 방향의 미세한 줄이 있다. */}
          <pattern id={`${uid}rbGrain`} width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
            <rect width="30" height="30" fill="none" />
            <rect width="15" height="30" fill="rgba(255,255,255,.022)" />
          </pattern>
          <clipPath id={`${uid}rbClip`}>
            <path d={RIBBON_BODY} />
          </clipPath>
          <clipPath id={`${uid}rbWallClip`}>
            <path d={RIBBON_WALL} />
          </clipPath>
        </defs>

        {/* (a) 몸통 — 오른쪽 실루엣이 x≈320 에서 거의 수직으로 위로 솟아 패널 상단에 닿는다. */}
        <path d={RIBBON_BODY} fill={`url(#${uid}rbBody)`} />
        {/* (b) 사선 결 + 상단 반사광/하단 그늘(몸통 안에서만) */}
        <g clipPath={`url(#${uid}rbClip)`}>
          <rect x="-60" y="-60" width="460" height="320" fill={`url(#${uid}rbGrain)`} />
          <rect x="-60" y="-60" width="460" height="320" fill={`url(#${uid}rbRoll)`} />
        </g>

        {/* (c) 안쪽 벽 — 몸통 위에 얹어 오른쪽 경계(고리의 근접 테두리)를 크리스프하게 만든다.
               그 곡선이 (156,88) 에서 꺾여 벽의 아래 경계로 이어지므로 "속이 보이는 두꺼운 고리"로 읽힌다. */}
        <path d={RIBBON_WALL} fill={`url(#${uid}rbRim)`} />
        {/* (d) 구멍 — 벽 오른쪽 위의 초승달. 오른쪽은 (c) 와 같은 곡선이라 틈이 없다. */}
        <path d={RIBBON_HOLE} fill={`url(#${uid}rbCavity)`} />
        {/* (c-2) 벽 상단 그늘(벽 안에서만) */}
        <g clipPath={`url(#${uid}rbWallClip)`}>
          <rect x="-60" y="-60" width="300" height="110" fill={`url(#${uid}rbShade)`} />
        </g>
      </svg>

      {/* 3. 격자 — 위: 어두운 선(밝은 면 위), 아래: 밝은 선(어두운 면 위). 리본 위를 지나간다. */}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          backgroundImage: gridLayer("rgba(255,255,255,.095)"),
          backgroundSize: `${CELL}px ${CELL}px`,
        }}
      />
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          backgroundImage: gridLayer("rgba(0,0,0,.055)"),
          backgroundSize: `${CELL}px ${CELL}px`,
          WebkitMaskImage: "linear-gradient(180deg,#000 0%,#000 40%,transparent 60%)",
          maskImage: "linear-gradient(180deg,#000 0%,#000 40%,transparent 60%)",
        }}
      />

      {/* 4. 꺾임 선 2곳: 오른쪽 위, 가운데 왼편. 격자 축(48 배수)에 정렬하고 끝을 alpha 로 지운다. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMinYMin slice"
        aria-hidden
        focusable="false"
      >
        <defs>
          <linearGradient id={`${uid}bendA`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#c9b2ff" stopOpacity="0" />
            <stop offset="34%" stopColor="#b07dff" stopOpacity="0.95" />
            <stop offset="72%" stopColor="#e2b9ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#e2b9ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}bendB`} x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0%" stopColor="#c79bff" stopOpacity="0" />
            <stop offset="40%" stopColor="#a06bff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7a4bf0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M 486 192 H 584 V 96 H 666" fill="none" stroke={`url(#${uid}bendA)`} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 296 288 V 336 H 340 V 444" fill="none" stroke={`url(#${uid}bendB)`} strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      {strip || backdrop ? null : (
      <>
      {/* 5. 하단 가독성 scrim — 별도 텍스트 카드를 만들지 않고 면만 눌러 준다(§9.2-6). */}
      <div
        className="absolute inset-x-0 bottom-0 h-[46%]"
        aria-hidden
        style={{
          background: "linear-gradient(180deg, rgba(20,21,25,0) 0%, rgba(20,21,25,.22) 48%, rgba(20,21,25,.4) 100%)",
        }}
      />

      {/* 6. 실제 HTML 문구 — 패널 왼쪽 안쪽 5%, 하단 영역의 큰 2~3줄(§9.2-6·§9.3).
             폼의 <h1> 과 경쟁하지 않도록 제목 태그가 아니라 <p> 로 둔다(페이지의 진짜 제목은 로그인 폼이다).
             색은 클래스가 아니라 style 로 못 박는다 — 여긴 테마와 무관하게 항상 어두운 면이라
             본문 색(--t)을 상속하면 Light 에서 글자가 사라진다(실제로 그렇게 났던 결함). */}
      <div className={compact ? "absolute inset-x-0 bottom-0 px-[5%] pb-[18px]" : "absolute inset-x-0 bottom-0 px-[5%] pb-[clamp(26px,5.6vw,96px)]"}>
        <p
          className="font-bold"
          style={{
            color: "var(--auth-art-tx)",
            fontSize: compact ? "clamp(24px, 5.2vw, 34px)" : "clamp(40px, 3.9vw, 72px)",
            lineHeight: 1.16,
            letterSpacing: "-0.02em",
            wordBreak: "keep-all",
          }}
        >
          {headline.map((line, i) => (
            <React.Fragment key={line}>
              {i > 0 && <br />}
              {line}
            </React.Fragment>
          ))}
        </p>
        <p
          className={compact ? "mt-2.5 max-w-[94%]" : "mt-[clamp(14px,1.5vw,26px)] max-w-[86%]"}
          style={{
            color: "var(--auth-art-tx2)",
            fontSize: compact ? "13px" : "clamp(13px, 1.15vw, 20px)",
            lineHeight: 1.62,
            wordBreak: "keep-all",
          }}
        >
          {description}
        </p>
      </div>
      </>
      )}
    </div>
  );
}
