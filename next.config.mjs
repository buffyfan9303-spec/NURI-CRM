/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 병렬 에이전트가 같은 작업 트리에서 dev 서버를 여러 개 띄우면 .next 를 공유해 서로의 빌드 캐시를 깨뜨린다
  // ("Cannot find module ./vendor-chunks/…", 404/500). 로컬에서만 NEXT_DIST_DIR=.next-3012 처럼 분리한다.
  // 운영(Vercel)은 이 변수를 쓰지 않으므로 기본 .next 그대로다.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 추후 이미지 도메인 추가 시 여기에
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
