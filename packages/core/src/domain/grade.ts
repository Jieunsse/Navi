import { GRADES, PROMOTION, type Grade, type Stats } from "@nabi/shared/grade.ts";

const HOUR_MS = 3_600_000;

/** 저장된 문자열을 등급으로 바꾼다. 모르는 값은 알로 본다. */
export const asGrade = (g: string | undefined): Grade => (GRADES as readonly string[]).includes(g ?? "") ? (g as Grade) : "egg";

export const nextGrade = (g: Grade): Grade | null => GRADES[GRADES.indexOf(g) + 1] ?? null;

/** 승급 판단. 세 조건을 모두 채우면 다음 등급 하나만 돌려준다(4-12). 이미 가장 높거나 모자라면 null. */
export function promotedGrade(current: Grade, s: Stats): Grade | null {
  const next = nextGrade(current);
  if (!next || next === "egg") return null;
  const need = PROMOTION[next];
  const ok = s.broadcastCount >= need.broadcastCount && s.totalBroadcastMs >= need.hours * HOUR_MS && s.donationCount >= need.donationCount;
  return ok ? next : null;
}
