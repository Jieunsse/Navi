import { CANCEL_WINDOW_MS, CANCEL_STALE_MS, REFUND_MIN } from "@nabi/shared/honey.ts";
import type { ChargeUsage } from "./honey.ts";

export type CancelCandidate = { status: string; honey: number; remaining: number; cancelableUntilMs: number | null };

/** 충전 취소를 거절하는 이유. 취소할 수 있으면 null(4-8). 미션에 묶인 꿀이 들어 있으면 남은 꿀이 줄어 있어서 같이 걸러진다. */
export function cancelRefusal(c: CancelCandidate, nowMs: number): string | null {
  if (c.status === "canceling") return "이미 취소하는 중이에요";
  if (c.status !== "done") return "취소할 수 없는 충전이에요";
  if (c.cancelableUntilMs === null || nowMs >= c.cancelableUntilMs) return "충전한 지 7일이 지나 취소할 수 없어요";
  if (c.remaining < c.honey) return "일부라도 쓰거나 미션에 묶인 꿀이 있는 충전은 취소할 수 없어요";
  return null;
}
export const canCancel = (c: CancelCandidate, nowMs: number) => cancelRefusal(c, nowMs) === null;
export const cancelDeadline = (approvedAtMs: number) => approvedAtMs + CANCEL_WINDOW_MS;
/** "취소 중"으로 5분 넘게 멈춘 충전인가(결정 26) */
export const isStaleCancel = (requestedAtMs: number | null, nowMs: number) => requestedAtMs === null || nowMs - requestedAtMs >= CANCEL_STALE_MS;

/**
 * 환급할 수 있는 꿀 = 잔액에서 7일 안에 취소할 수 있는 충전 건의 꿀을 뺀 나머지(결정 22, 26).
 * 완료된 충전 건의 남은 꿀 합이 잔액과 같으므로, 취소할 수 없는 충전 건의 남은 꿀을 더한다.
 * 묶인 미션 꿀은 이미 잔액에서 빠져 있어 다시 빼지 않는다.
 */
export function refundable(charges: readonly (CancelCandidate & { id: string })[], nowMs: number) {
  const items: ChargeUsage[] = [];
  let cancelable = 0;
  for (const c of charges) {
    if (c.status !== "done" || c.remaining <= 0) continue;
    if (canCancel(c, nowMs)) cancelable += c.remaining;
    else items.push({ chargeId: c.id, amount: c.remaining });
  }
  const total = items.reduce((s, i) => s + i.amount, 0);
  return { items, total, cancelable, canApply: total >= REFUND_MIN };
}
