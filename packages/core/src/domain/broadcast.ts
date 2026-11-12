import { COUNTED_BROADCAST_MS, TEST_ACCOUNTS, TEST_BROADCAST_LIMIT_MS, type BroadcastStatus } from "@nabi/shared";

export const hostIdentity = (uid: string) => `host_${uid}`;

/** 테스트 방송자 방송은 30분까지다(4-18). */
export function overTestLimit(ownerId: string, status: BroadcastStatus, startedAt: Date | null, now: Date) {
  return ownerId === TEST_ACCOUNTS.broadcaster && status === "live" && !!startedAt && now.getTime() - startedAt.getTime() >= TEST_BROADCAST_LIMIT_MS;
}

/** 방송 종료 때 방송자 통계에 더할 값(4-12). 10분 이상만 횟수로 센다. */
export function endStats(startedAt: Date | null, endedAt: Date) {
  const durationMs = startedAt ? Math.max(0, endedAt.getTime() - startedAt.getTime()) : 0;
  return { durationMs, counted: durationMs >= COUNTED_BROADCAST_MS ? 1 : 0 };
}
