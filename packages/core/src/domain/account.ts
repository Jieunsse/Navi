import { REAUTH_WINDOW_MS } from "@nabi/shared/account.ts";
import { stillBlocked } from "./moderation.ts";

/** 비밀번호나 구글 창으로 다시 확인한 로그인인지. authTime은 토큰의 auth_time(초). */
export const isRecentLogin = (authTimeSec: number | undefined, nowMs: number) =>
  authTimeSec !== undefined && nowMs - authTimeSec * 1000 <= REAUTH_WINDOW_MS;

/** 만든 지 30분 안의 결제 대기 충전은 탈퇴를 막는다(4-11). */
export const isBlockingCharge = (c: { status: string; createdAtMs: number }, nowMs: number, windowMs = 30 * 60 * 1000) =>
  c.status === "pending" && nowMs - c.createdAtMs < windowMs;

/** 채팅 금지나 방송 금지가 적용 중이면 탈퇴할 수 없다. 탈퇴하고 다시 가입해서 제재를 피하지 못하게 한다(4-11, 06 결정 29). */
export const sanctionBlocksWithdraw = (u: { chatBannedUntil?: Date | null; broadcastBannedUntil?: Date | null }, now: Date) =>
  stillBlocked(u.chatBannedUntil, now) || stillBlocked(u.broadcastBannedUntil, now);

/** 남은 꿀이나 받지 못한 수익 배분금이 있는데 포기에 동의하지 않았으면 거절 이유를 돌려준다(4-8, 4-11). 없으면 null. */
export function abandonRefusal(left: { honey: number; earnings: number }, agreed: { abandonHoney: boolean; abandonEarnings: boolean }) {
  if (left.honey > 0 && !agreed.abandonHoney) return { code: "HONEY_ABANDON_REQUIRED", message: "남은 꿀을 포기하고 탈퇴한다는 것에 동의해 주세요" };
  if (left.earnings > 0 && !agreed.abandonEarnings) return { code: "EARNINGS_ABANDON_REQUIRED", message: "남은 수익 배분금을 포기하고 탈퇴한다는 것에 동의해 주세요" };
  return null;
}
