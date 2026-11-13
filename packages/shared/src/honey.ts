import { z } from "zod";

// 꿀 충전·후원 약속과 숫자 규칙(07 4-8). 임시값은 여기서만 바꾼다.
export const HONEY_NOTICE_VERSION = "2026-11-07"; // 13장 안내 문구 버전
export const CHARGE_UNITS = [1_000, 5_000, 10_000, 50_000, 100_000] as const;
export const CHARGE_MIN = 1_000;
export const CHARGE_MAX = 1_000_000;
export const CHARGE_STEP = 1_000;
export const DAILY_CHARGE_LIMIT = 1_000_000;
export const DONATION_MIN = 1_000;
export const DONATION_MAX = 1_000_000;
export const DONATION_MESSAGE_MAX = 100;
export const ADULT_AGE = 19;
export const PENDING_CHARGE_MS = 30 * 60 * 1000; // 결제 대기 건을 한도에 세는 시간
export const CANCEL_WINDOW_MS = 7 * 24 * 3600_000; // 충전 취소 기한(충전한 날부터 7일)
export const CANCEL_STALE_MS = 5 * 60 * 1000; // "취소 중"으로 멈춘 충전을 정리하는 시간(임시값)
export const ANONYMOUS_NAME = "익명";

// 미션 후원(4-8). 임시값은 여기서만 바꾼다.
export const MISSION_CONTENT_MAX = 50;
export const MISSION_MIN_MINUTES = 5;
export const MISSION_MAX_MINUTES = 180;
export const MISSION_DEFAULT_MINUTES = 30;
/** 실패 시 응원금 = 상금의 20%, 100꿀 아래는 버린다(4-8). 20%는 상금 ÷ 5라서 500꿀마다 100꿀이다. */
export const cheerAmount = (prize: number) => Math.floor(prize / 500) * 100;

// 환급(4-8). 꿀 1개 = 결제 금액 1.1원, 수수료 10%, 원 단위 아래는 버린다.
export const REFUND_MIN = 1_000;
export function refundQuote(honey: number) {
  const base = Math.floor((honey * 11) / 10);
  const fee = Math.floor(base / 10);
  return { base, fee, payout: base - fee };
}

/** 결제 금액 = 꿀 × 1.1(부가세 10%). 꿀은 1,000 단위라 나누어떨어진다. */
export const payAmount = (honey: number) => (honey * 11) / 10;

/**
 * "충전하고 후원하기"에서 자동으로 고르는 충전 꿀 수(4-8).
 * 모자란 꿀 이상인 가장 작은 단위. 가장 큰 단위보다 크거나 남은 한도를 넘으면 1,000 단위로 올린 값.
 * 그것도 한도를 넘으면 null(충전할 수 없다).
 */
export function suggestChargeHoney(shortfall: number, remainingLimit: number): number | null {
  const ceil = Math.ceil(Math.max(shortfall, CHARGE_MIN) / CHARGE_STEP) * CHARGE_STEP;
  const unit = CHARGE_UNITS.find((u) => u >= shortfall);
  const pick = unit && unit <= remainingLimit ? unit : ceil;
  return pick <= remainingLimit && pick <= CHARGE_MAX ? pick : null;
}

const honeyAmount = (min: number, max: number) =>
  z
    .number()
    .int("꿀은 정수로 입력해 주세요")
    .min(min, `${min.toLocaleString("ko-KR")}꿀부터예요`)
    .max(max, `${max.toLocaleString("ko-KR")}꿀까지예요`);

export const chargeHoneySchema = honeyAmount(CHARGE_MIN, CHARGE_MAX).refine((n) => n % CHARGE_STEP === 0, "1,000꿀 단위로 입력해 주세요");
export const donationAmountSchema = honeyAmount(DONATION_MIN, DONATION_MAX);
export const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "요청 번호가 올바르지 않아요");

export const donationInputSchema = z.object({
  requestId: requestIdSchema,
  amount: donationAmountSchema,
  message: z.string().max(DONATION_MESSAGE_MAX, `메시지는 ${DONATION_MESSAGE_MAX}자까지예요`).default(""),
  anonymous: z.boolean().default(false),
});

/** 미션 후원 입력. amount는 성공 시 상금이다. */
export const missionInputSchema = z.object({
  requestId: requestIdSchema,
  amount: donationAmountSchema,
  content: z.string().trim().min(1, "미션 내용을 입력해 주세요").max(MISSION_CONTENT_MAX, `미션 내용은 ${MISSION_CONTENT_MAX}자까지예요`),
  limitMinutes: z
    .number()
    .int("제한 시간은 분 단위로 정해 주세요")
    .min(MISSION_MIN_MINUTES, `제한 시간은 ${MISSION_MIN_MINUTES}분부터예요`)
    .max(MISSION_MAX_MINUTES, "제한 시간은 3시간까지예요"),
  anonymous: z.boolean().default(false),
});

export const missionStatusSchema = z.enum(["pending", "active", "rejected", "success", "failed", "canceled"]);
export type MissionStatus = z.infer<typeof missionStatusSchema>;
export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  pending: "대기 중",
  active: "진행 중",
  rejected: "거절됨",
  success: "성공",
  failed: "실패",
  canceled: "취소됨",
};
export const missionActionSchema = z.enum(["accept", "reject", "success", "fail", "expire"]);

export const missionCardSchema = z.object({
  id: z.string(),
  content: z.string(),
  amount: z.number(),
  cheer: z.number(),
  status: missionStatusSchema,
  donor: z.string(), // 익명이면 "익명"
  limitMinutes: z.number(),
  deadlineAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type MissionCard = z.infer<typeof missionCardSchema>;

export const identityInputSchema = z.object({
  name: z.string().trim().min(2, "이름을 입력해 주세요").max(30),
  birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일은 2000-01-31 모양으로 입력해 주세요"),
  phone: z.string().regex(/^01\d{8,9}$/, "휴대폰 번호는 숫자만 입력해 주세요(예: 01012345678)"),
});

export const chargeStatusSchema = z.enum(["pending", "done", "failed", "canceling", "canceled"]);

/** 꿀 내역 종류의 화면 이름(4-8의 꿀 내역 규칙). 모르는 종류는 그대로 보여준다. */
export const LEDGER_LABEL: Record<string, string> = {
  charge: "충전",
  chargeCancel: "충전 취소",
  chargeCancelRevert: "충전 취소 실패 반환",
  donation: "후원",
  missionHold: "미션 묶음",
  missionConfirm: "미션 확정",
  missionReturn: "미션 반환",
  refundHold: "환급 묶음",
  refund: "환급",
  refundReturn: "환급 반환",
  seedAdjust: "시드 조정",
  withdrawAbandon: "탈퇴 포기",
};

export const refundStatusSchema = z.enum(["pending", "sending", "done", "rejected", "failed"]);
export type RefundStatus = z.infer<typeof refundStatusSchema>;
export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  pending: "대기",
  sending: "송금 중",
  done: "환급 완료(테스트)",
  rejected: "거절",
  failed: "송금 실패",
};
/** 처리 중인 환급(탈퇴를 막고, 새 신청도 막는다) */
export const ACTIVE_REFUND_STATUSES: readonly RefundStatus[] = ["pending", "sending", "failed"];

export const refundInputSchema = z.object({
  requestId: requestIdSchema,
  bank: z.string().trim().min(1, "은행 이름을 입력해 주세요").max(20),
  accountNumber: z.string().regex(/^\d{6,20}$/, "계좌번호는 숫자만 6~20자리로 입력해 주세요"),
});

export const walletSchema = z.object({
  balance: z.number(),
  pendingMission: z.number(), // 미션에 묶인 꿀
  pendingRefund: z.number(), // 환급 대기 중인 꿀
  identityName: z.string().nullable(), // 본인인증 이름(환급 계좌 예금주)
  verified: z.boolean(),
  adult: z.boolean(),
  todayCharged: z.number(),
  todayRemaining: z.number(),
  charges: z.array(
    z.object({
      id: z.string(),
      honey: z.number(),
      amount: z.number(),
      remaining: z.number(),
      status: chargeStatusSchema,
      createdAt: z.iso.datetime(),
      cancelable: z.boolean(),
      cancelableUntil: z.iso.datetime().nullable(),
      cancelBlockedReason: z.string().nullable(), // 완료된 충전을 취소할 수 없는 이유(4-11)
    }),
  ),
  ledger: z.array(z.object({ id: z.string(), type: z.string(), amount: z.number(), createdAt: z.iso.datetime() })),
  refund: z.object({
    refundable: z.number(), // 환급할 수 있는 꿀
    cancelableHoney: z.number(), // 충전 취소로 돌려받을 수 있는 꿀
    base: z.number(),
    fee: z.number(),
    payout: z.number(),
    canApply: z.boolean(),
  }),
  refunds: z.array(
    z.object({
      id: z.string(),
      honey: z.number(),
      payout: z.number(),
      bank: z.string(),
      last4: z.string(),
      status: refundStatusSchema,
      rejectReason: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type Wallet = z.infer<typeof walletSchema>;

export const donationOutcomeSchema = z.object({ status: z.enum(["none", "done", "skipped"]), reason: z.string().optional() });
export type DonationOutcome = z.infer<typeof donationOutcomeSchema>;

const none = z.object({});

// contracts.ts와 같은 모양(결정 18). 서버는 route 헬퍼로, 화면은 apiFetch로 쓴다.
const c = <Req extends z.ZodType, Res extends z.ZodType>(method: "GET" | "POST", path: string, req: Req, res: Res) => ({ method, path, req, res }) as const;

export const honeyApi = {
  wallet: c("GET", "/api/honey", none, walletSchema),
  verifyIdentity: c("POST", "/api/honey/verify", identityInputSchema, z.object({ adult: z.boolean() })),
  createCharge: c(
    "POST",
    "/api/charges",
    z.object({
      honey: chargeHoneySchema,
      agreedVersion: z.literal(HONEY_NOTICE_VERSION),
      returnTo: z.string().max(300).optional(),
      broadcastId: z.string().optional(), // 충전하고 후원하기: 함께 처리할 후원(채팅 또는 미션)
      donation: donationInputSchema.optional(),
      mission: missionInputSchema.optional(),
    }),
    z.object({ orderId: z.string(), amount: z.number(), orderName: z.string() }),
  ),
  confirmCharge: c(
    "POST",
    "/api/charges/confirm",
    z.object({ paymentKey: z.string().min(1), orderId: z.string().min(1), amount: z.coerce.number() }),
    z.object({ honey: z.number(), returnTo: z.string().nullable(), donation: donationOutcomeSchema }),
  ),
  failCharge: c("POST", "/api/charges/fail", z.object({ orderId: z.string().min(1) }), z.object({ ok: z.literal(true) })),
  donate: c("POST", "/api/broadcasts/:id/donations", donationInputSchema, z.object({ ok: z.literal(true), balance: z.number() })),
  donateMission: c("POST", "/api/broadcasts/:id/missions", missionInputSchema, z.object({ ok: z.literal(true), balance: z.number() })),
  /** 방송자만 부른다(송출 화면의 미션 목록). 마감 시각 확인 때문에 서버가 시각을 판단한다. */
  listMissions: c("GET", "/api/broadcasts/:id/missions", none, z.object({ items: z.array(missionCardSchema) })),
  /** accept·reject·success·fail은 방송자만, expire는 누구나(서버가 마감 시각을 확인한다). */
  missionAction: c("POST", "/api/broadcasts/:id/missions/:missionId/:action", none, z.object({ status: missionStatusSchema })),
  cancelCharge: c("POST", "/api/charges/:id/cancel", none, z.object({ status: z.enum(["canceled", "canceling"]) })),
  requestRefund: c("POST", "/api/refunds", refundInputSchema, z.object({ ok: z.literal(true) })),
} as const;

// 운영자 환급 관리(4-15). 테스트 운영자에게 실제 사용자 줄은 가려서 내려보낸다.
export const adminRefundSchema = z.object({
  id: z.string(),
  masked: z.boolean(),
  nickname: z.string(),
  honey: z.number(),
  base: z.number(),
  fee: z.number(),
  payout: z.number(),
  account: z.string(), // "은행 ****1234 (예금주)"
  status: refundStatusSchema,
  reason: z.string().nullable(), // 거절 사유 또는 송금 실패 이유
  createdAt: z.iso.datetime(),
  recentCharges: z.array(z.object({ honey: z.number(), status: z.string(), createdAt: z.iso.datetime() })),
  recentDonations: z.array(z.object({ amount: z.number(), kind: z.string(), createdAt: z.iso.datetime() })),
});
export type AdminRefund = z.infer<typeof adminRefundSchema>;

export const adminRefundApi = {
  list: c("GET", "/api/admin/refunds", none, z.object({ items: z.array(adminRefundSchema), isTestAdmin: z.boolean() })),
  approve: c("POST", "/api/admin/refunds/:id/approve", none, z.object({ status: refundStatusSchema })),
  reject: c("POST", "/api/admin/refunds/:id/reject", z.object({ reason: z.string().trim().min(1, "사유를 적어 주세요").max(200) }), z.object({ ok: z.literal(true) })),
} as const;
