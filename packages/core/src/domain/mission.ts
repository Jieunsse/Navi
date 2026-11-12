import { cheerAmount, type MissionStatus } from "@nabi/shared/honey.ts";
import type { ChargeUsage } from "./honey.ts";

/** 방송자가 정한 결과를 돈의 움직임으로 바꾼다(4-8 표). 거절·취소는 전부 돌려주고, 성공은 전부 전달하고, 실패는 응원금만 전달한다. */
export type MissionEnd = "rejected" | "canceled" | "success" | "failed";

export function missionMoney(end: MissionEnd, prize: number) {
  const delivered = end === "success" ? prize : end === "failed" ? Math.min(cheerAmount(prize), prize) : 0;
  return { delivered, returned: prize - delivered };
}

/** 진행 중 미션의 마감 시각이 지났는가. 서버가 판단한다(결정 27). */
export const isPastDeadline = (deadlineMs: number | null, nowMs: number) => deadlineMs !== null && nowMs >= deadlineMs;

/** "성공"을 눌렀을 때 실제로 처리할 결과. 마감이 지났으면 실패다(결정 27). */
export const successOrLate = (deadlineMs: number | null, nowMs: number): MissionEnd => (isPastDeadline(deadlineMs, nowMs) ? "failed" : "success");

/** 돌려줄 꿀을 나중에 쓴 충전 건부터 되살린다. 응원금은 먼저 쓴 충전 건에서 나간 것으로 본다(4-8). */
export function restoreLifo(usage: readonly ChargeUsage[], returned: number): ChargeUsage[] {
  const out: ChargeUsage[] = [];
  let left = returned;
  for (const u of [...usage].reverse()) {
    if (left <= 0) break;
    const give = Math.min(u.amount, left);
    out.push({ chargeId: u.chargeId, amount: give });
    left -= give;
  }
  return out;
}

/** 방송이 끝날 때 아직 남아 있는 미션의 결과: 대기 중은 취소, 진행 중은 실패(07 3장) */
export const endOfBroadcast = (status: MissionStatus): MissionEnd | null => (status === "pending" ? "canceled" : status === "active" ? "failed" : null);

/** 처리 중인 미션인가(탈퇴를 막는다) */
export const isOpenMission = (status: string) => status === "pending" || status === "active";
