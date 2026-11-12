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
});

export const identityInputSchema = z.object({
  name: z.string().trim().min(2, "이름을 입력해 주세요").max(30),
  birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일은 2000-01-31 모양으로 입력해 주세요"),
  phone: z.string().regex(/^01\d{8,9}$/, "휴대폰 번호는 숫자만 입력해 주세요(예: 01012345678)"),
});

export const chargeStatusSchema = z.enum(["pending", "done", "failed"]);

export const walletSchema = z.object({
  balance: z.number(),
  verified: z.boolean(),
  adult: z.boolean(),
  todayCharged: z.number(),
  todayRemaining: z.number(),
  charges: z.array(
    z.object({ id: z.string(), honey: z.number(), amount: z.number(), remaining: z.number(), status: chargeStatusSchema, createdAt: z.iso.datetime() }),
  ),
  ledger: z.array(z.object({ id: z.string(), type: z.enum(["charge", "donation"]), amount: z.number(), createdAt: z.iso.datetime() })),
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
      broadcastId: z.string().optional(), // 충전하고 후원하기: 함께 처리할 후원
      donation: donationInputSchema.optional(),
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
} as const;
