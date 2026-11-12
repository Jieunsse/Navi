import { z } from "zod";
import type { Contract } from "./contracts.ts";
import { ADMIN_REASON_MAX } from "./moderation.ts";
import { requestIdSchema } from "./honey.ts";

// 정산 약속(07 4-12, 4-15, 06 결정 11, 27, 28). 임시값은 여기서만 바꾼다.
export const PAYOUT_DAY = 25; // 정산일(임시)
export const SETTLEMENT_CHUNK = 490; // 정산 기록 하나에 넣는 후원 수. 트랜잭션 쓰기 500개 제한 때문이다.

export const settlementStatusSchema = z.enum(["pending", "heldNoAccount", "heldAdmin", "sending", "paid", "failed", "abandoned"]);
export type SettlementStatus = z.output<typeof settlementStatusSchema>;
export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  pending: "지급 대기",
  heldNoAccount: "보류(정산 정보 없음)",
  heldAdmin: "보류(운영 조치)",
  sending: "송금 중",
  paid: "지급 완료",
  failed: "지급 실패",
  abandoned: "포기",
};
/** 목업 송금이면 "지급 완료(테스트)"로 보여준다. */
export const statusText = (status: SettlementStatus, mock: boolean) => (status === "paid" && mock ? "지급 완료(테스트)" : SETTLEMENT_STATUS_LABEL[status]);

const iso = z.string();
export const mySettlementSchema = z.object({
  id: z.string(),
  periodStart: iso,
  periodEnd: iso,
  mode: z.enum(["scheduled", "test"]),
  donationCount: z.number(),
  streamerShare: z.number(),
  status: settlementStatusSchema,
  holdReason: z.string().nullable(),
  paidAt: iso.nullable(),
  transferId: z.string().nullable(),
  mock: z.boolean(),
  createdAt: iso,
});
export type MySettlement = z.output<typeof mySettlementSchema>;

export const settlementCardSchema = z.object({
  grade: z.string(),
  sharePercent: z.number(),
  account: z.object({ bank: z.string(), last4: z.string(), test: z.boolean() }).nullable(),
  nearest: z.object({ date: iso, amount: z.number() }), // 가장 가까운 지급일에 받을 금액
  following: z.object({ date: iso, amount: z.number() }), // 그다음 지급일에 받을 금액(쌓이는 중)
});

const reason = z.string().trim().min(1, "사유를 적어 주세요").max(ADMIN_REASON_MAX, `사유는 ${ADMIN_REASON_MAX}자까지 쓸 수 있어요`);

export const adminSettlementSchema = mySettlementSchema.extend({
  streamerId: z.string(),
  streamerNickname: z.string(),
  masked: z.boolean(), // 테스트 운영자에게 실제 사용자는 가려서 준다
  payout: z.number(),
  hasSameIdentity: z.boolean(),
  streamerHeld: z.boolean(),
});
export const jobRunSchema = z.object({
  id: z.string(),
  jobName: z.string(),
  mode: z.enum(["scheduled", "test"]),
  adminNickname: z.string().nullable(),
  startedAt: iso,
  endedAt: iso.nullable(),
  streamerCount: z.number(),
  result: z.string(),
});
export const adminHoldSchema = z.object({ userId: z.string(), nickname: z.string(), masked: z.boolean(), reason: z.string() });

export const testRunResultSchema = z.object({
  newDonations: z.number(),
  newShare: z.number(),
  paidCount: z.number(),
  heldCount: z.number(),
  message: z.string(),
});
export type TestRunResult = z.output<typeof testRunResultSchema>;

const c = <Req extends z.ZodType, Res extends z.ZodType>(method: Contract["method"], path: string, req: Req, res: Res) =>
  ({ method, path, req, res }) satisfies Contract<Req, Res>;
const none = z.object({});
const ok = z.object({ ok: z.literal(true) });

export const settlementApi = {
  mine: c("GET", "/api/me/settlements", none, z.object({ card: settlementCardSchema, items: z.array(mySettlementSchema) })),
  adminList: c(
    "GET",
    "/api/admin/settlements",
    none,
    z.object({ testRunEnabled: z.boolean(), items: z.array(adminSettlementSchema), holds: z.array(adminHoldSchema), runs: z.array(jobRunSchema) }),
  ),
  adminRunTest: c("POST", "/api/admin/settlements/run-test", z.object({ requestId: requestIdSchema }), testRunResultSchema),
  adminHold: c("POST", "/api/admin/settlements/:userId/hold", z.object({ reason }), ok),
  adminRelease: c("POST", "/api/admin/settlements/:userId/release", z.object({ reason }), ok),
  /** 예약 작업 실행기 입구. 비밀 값(CRON_SECRET)을 가진 곳만 부를 수 있다. */
  monthlyJob: c("GET", "/api/jobs/monthly-settlement", none, z.object({ streamerCount: z.number(), message: z.string() })),
} as const;
