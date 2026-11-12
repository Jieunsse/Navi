import { GRADE_LABEL, type Grade } from "@nabi/shared/grade.ts";
import { ANONYMOUS_NAME } from "@nabi/shared/honey.ts";
import { NOTIFICATION_TTL_DAYS, type NotificationKind } from "@nabi/shared/notification.ts";

/** 알림 문서에 들어가는 내용(07 4-17). 문구와 이동할 주소를 여기서 정한다. */
export type NotificationInput = { kind: NotificationKind; text: string; href: string | null; refId?: string | null };

const n = (v: number) => v.toLocaleString("ko-KR");
const who = (nickname: string, anonymous: boolean) => (anonymous ? ANONYMOUS_NAME : nickname);

export const donationReceived = (donor: string, anonymous: boolean, amount: number, refId: string): NotificationInput => ({
  kind: "donation",
  text: `${who(donor, anonymous)}님이 ${n(amount)}꿀을 후원했어요`,
  href: "/studio",
  refId,
});

/** 미션 상금(성공)이나 응원금(실패)이 방송자에게 전달됐을 때 */
export const missionDelivered = (donor: string, anonymous: boolean, delivered: number, success: boolean, refId: string): NotificationInput => ({
  kind: "donation",
  text: `${who(donor, anonymous)}님의 미션 ${success ? "상금" : "응원금"} ${n(delivered)}꿀이 전달됐어요`,
  href: "/studio",
  refId,
});

const MISSION_RESULT = { success: "성공으로 끝났어요", failed: "실패로 끝났어요", rejected: "거절됐어요", canceled: "취소됐어요" } as const;
export type MissionResult = keyof typeof MISSION_RESULT;

/** 미션을 보낸 시청자에게. streamer는 미션을 받은 방송자 닉네임이다. */
export const missionResult = (streamer: string, result: MissionResult, refId: string): NotificationInput => ({
  kind: "mission",
  text: `${streamer}님께 보낸 미션이 ${MISSION_RESULT[result]}`,
  href: "/me",
  refId,
});

export const settlementPaid = (amount: number, refId: string): NotificationInput => ({ kind: "settlement", text: `정산 ${n(amount)}원이 지급됐어요`, href: "/studio", refId });
export const settlementHeld = (reason: string, refId: string | null): NotificationInput => ({ kind: "settlement", text: `정산이 보류됐어요(${reason})`, href: "/studio", refId });

export const promoted = (to: Grade): NotificationInput => ({ kind: "promotion", text: `${GRADE_LABEL[to]} 등급이 됐어요`, href: "/me/grade" });

export const reportResolved = (label: string, acted: boolean, refId: string): NotificationInput => ({
  kind: "report",
  text: acted ? `신고하신 ${label}에 조치했어요` : `신고하신 ${label}은(는) 기각됐어요`,
  href: "/me/reports",
  refId,
});

/** 이의 제기 처리 알림. 이의 제기 기능을 만드는 쪽이 처리 트랜잭션에서 writeNotification과 함께 쓴다. */
export const appealResolved = (accepted: boolean, refId: string): NotificationInput => ({
  kind: "appeal",
  text: accepted ? "이의 제기를 받아들였어요" : "이의 제기가 거절됐어요",
  href: "/me/sanctions",
  refId,
});

export const refundDone = (payout: number, refId: string): NotificationInput => ({ kind: "refund", text: `${n(payout)}원 환급이 끝났어요`, href: "/me/honey", refId });
export const refundRejected = (reason: string, refId: string): NotificationInput => ({ kind: "refund", text: `환급 신청이 거절됐어요(${reason})`, href: "/me/honey", refId });

/** 운영 조치(채팅 숨김, 방송 강제 종료, 다시보기 비공개). 이동하지 않는다. */
export const operatorAction = (text: string, refId: string | null = null): NotificationInput => ({ kind: "action", text, href: null, refId });

/** 만든 지 30일이 안 지났으면 보여준다. */
export const isFresh = (createdAtMs: number, nowMs: number) => nowMs - createdAtMs < NOTIFICATION_TTL_DAYS * 86_400_000;
export const freshSince = (nowMs: number) => new Date(nowMs - NOTIFICATION_TTL_DAYS * 86_400_000);
