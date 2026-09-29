/** 미수 연령 구간. 서버 bld_aging(0032)과 같은 경계다. 납기 전(연체 0일)은 따로 두고 연체일 1~30 / 31~60 / 61~90 / 90 초과로 나눈다. 표시용 재분류다. */
export type Bucket = "not_due" | "d0_30" | "d31_60" | "d61_90" | "d90p";
export const BUCKET_LABEL: Record<Bucket, string> = { not_due: "납기 전", d0_30: "1~30일", d31_60: "31~60일", d61_90: "61~90일", d90p: "90일 초과" };
const DAY = 86_400_000;

/** asof·due 는 YYYY-MM-DD. due 가 없거나 asof 보다 늦으면 0. */
export function ageDays(asof: string, due: string | null | undefined): number {
  if (!due) return 0;
  const d = Math.round((Date.parse(`${asof.slice(0, 10)}T00:00:00Z`) - Date.parse(`${due.slice(0, 10)}T00:00:00Z`)) / DAY);
  return Number.isFinite(d) ? Math.max(d, 0) : 0;
}
/** age 는 납기 경과일. 0 이하(납기 전·당일)는 not_due. */
export const bucketOf = (age: number): Bucket => (age <= 0 ? "not_due" : age <= 30 ? "d0_30" : age <= 60 ? "d31_60" : age <= 90 ? "d61_90" : "d90p");
