/**
 * 고객 등록·수정 검증 스키마.
 * 기존 validateMTM() 규칙을 zod refine 로 옮김.
 */
import { z } from "zod";

const numLike = z.preprocess(
  (v) => (v === "" || v == null ? 0 : Number(v)),
  z.number()
);

export const measurementsSchema = z.object({
  height: numLike, weight: numLike, neck: numLike, shoulder: numLike,
  chest: numLike, belly: numLike, waist: numLike, hip: numLike,
  thigh: numLike, sleeve: numLike, jacket: numLike,
  tw: numLike, tl: numLike, rise: numLike,
});

export const customerRegisterSchema = z
  .object({
    name: z.string().trim().min(1, "이름을 입력해주세요."),
    phone: z.string().trim().min(1, "전화번호를 입력해주세요."),
    birth: z.string().trim().min(1, "생년월일을 선택해주세요."),
    gender: z.string().optional(),
    memo: z.string().optional(),
    retailer: z.string().optional(),
  })
  .merge(measurementsSchema)
  .refine(
    (d) => !(d.chest > 0 && d.waist > 0 && d.chest < d.waist - 15),
    {
      message: "가슴둘레와 허리둘레 비율을 다시 확인하십시오.",
      path: ["chest"],
    }
  )
  .refine(
    (d) => !(d.tl > 0 && d.height > 0 && d.tl > d.height * 0.65),
    {
      message: "바지 길이가 키에 비해 너무 깁니다. 수치를 확인하십시오.",
      path: ["tl"],
    }
  );

export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;

export const customerEditSchema = z
  .object({
    phone: z.string().trim().optional(),
    gender: z.string().optional(),
    memo: z.string().optional(),
    fabric: z.string().optional(),
    lining: z.string().optional(),
    style: z.string().optional(),
    vent: z.string().optional(),
    pocket: z.string().optional(),
  })
  .merge(measurementsSchema);

export type CustomerEditInput = z.infer<typeof customerEditSchema>;
