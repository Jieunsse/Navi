import { z } from "zod";
import type { Contract } from "./contracts.ts";

// 방송자 등급 약속(07 4-12, 06 결정 9). 임시값은 여기서만 바꾼다.
export const GRADES = ["egg", "larva", "pupa", "butterfly"] as const;
export type Grade = (typeof GRADES)[number];
export const gradeSchema = z.enum(GRADES);
export const GRADE_LABEL: Record<Grade, string> = { egg: "알", larva: "애벌레", pupa: "번데기", butterfly: "나비" };

/** 등급별 혜택. share는 방송자 몫 퍼센트다(core의 honey.ts와 같은 값이어야 한다. 테스트가 확인한다). */
export const GRADE_BENEFITS: Record<Grade, { share: number; retention: string; badge: string | null }> = {
  egg: { share: 80, retention: "7일", badge: null },
  larva: { share: 82, retention: "30일", badge: "애벌레 표시" },
  pupa: { share: 85, retention: "90일", badge: "번데기 표시" },
  butterfly: { share: 88, retention: "영구", badge: "나비 표시" },
};

export type Stats = { broadcastCount: number; totalBroadcastMs: number; donationCount: number };

/** 다음 등급으로 오르는 조건. 세 가지를 모두 채워야 한다. */
export const PROMOTION: Record<Exclude<Grade, "egg">, { broadcastCount: number; hours: number; donationCount: number }> = {
  larva: { broadcastCount: 3, hours: 2, donationCount: 1 },
  pupa: { broadcastCount: 15, hours: 20, donationCount: 30 },
  butterfly: { broadcastCount: 50, hours: 100, donationCount: 300 },
};

export const gradeInfoSchema = z.object({
  grade: gradeSchema,
  sharePercent: z.number(),
  stats: z.object({ broadcastCount: z.number(), totalBroadcastMs: z.number(), donationCount: z.number() }),
  next: z.object({ grade: gradeSchema, broadcastCount: z.number(), hours: z.number(), donationCount: z.number() }).nullable(),
  history: z.array(z.object({ grade: gradeSchema, shareRate: z.number(), changedAt: z.string() })),
});
export type GradeInfo = z.output<typeof gradeInfoSchema>;

const c = <Req extends z.ZodType, Res extends z.ZodType>(method: Contract["method"], path: string, req: Req, res: Res) =>
  ({ method, path, req, res }) satisfies Contract<Req, Res>;

export const gradeApi = {
  myGrade: c("GET", "/api/me/grade", z.object({}), gradeInfoSchema),
} as const;
