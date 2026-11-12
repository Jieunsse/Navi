import { REAUTH_WINDOW_MS } from "@nabi/shared/account.ts";

/** 비밀번호나 구글 창으로 다시 확인한 로그인인지. authTime은 토큰의 auth_time(초). */
export const isRecentLogin = (authTimeSec: number | undefined, nowMs: number) =>
  authTimeSec !== undefined && nowMs - authTimeSec * 1000 <= REAUTH_WINDOW_MS;

/** 만든 지 30분 안의 결제 대기 충전은 탈퇴를 막는다(4-11). */
export const isBlockingCharge = (c: { status: string; createdAtMs: number }, nowMs: number, windowMs = 30 * 60 * 1000) =>
  c.status === "pending" && nowMs - c.createdAtMs < windowMs;
