import { z } from "zod";
import type { Contract } from "./contracts.ts";

// 이의 제기, 금칙어 관리, 운영자 부가 화면 약속(07 4-15). 숫자는 임시값이라 여기서만 바꾼다.
export const APPEAL_MIN = 10;
export const APPEAL_MAX = 500;
export const APPEAL_ANSWER_MAX = 200;
export const BANNED_WORD_MAX = 20;

export const appealContentSchema = z.object({
  content: z.string().trim().min(APPEAL_MIN, `이유를 ${APPEAL_MIN}자 이상 적어 주세요`).max(APPEAL_MAX, `이유는 ${APPEAL_MAX}자까지 쓸 수 있어요`),
});
export const appealStatusSchema = z.enum(["pending", "accepted", "rejected"]);
export const APPEAL_STATUS_LABEL = { pending: "처리 중", accepted: "받아들임", rejected: "거절" } as const;
/** 내 제재 내역에 붙는 이의 제기 결과 */
export const myAppealSchema = z.object({ status: appealStatusSchema, answer: z.string().nullable() });

export const adminAppealSchema = z.object({
  id: z.string(), // 제재 ID와 같다
  userNickname: z.string(),
  masked: z.boolean(), // 심사용이 아닌 계정을 테스트 운영자에게 가렸는지
  sanctionKind: z.enum(["warning", "chatBan", "broadcastBan", "suspend"]),
  sanctionReason: z.string(),
  content: z.string(),
  status: appealStatusSchema,
  answer: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminAppeal = z.output<typeof adminAppealSchema>;
export const resolveAppealSchema = z.object({
  accept: z.boolean(),
  answer: z.string().trim().max(APPEAL_ANSWER_MAX, `답변은 ${APPEAL_ANSWER_MAX}자까지 쓸 수 있어요`).default(""),
});

export const bannedWordInputSchema = z.object({ word: z.string().trim().min(1, "금칙어를 입력해 주세요").max(BANNED_WORD_MAX, `금칙어는 ${BANNED_WORD_MAX}자까지예요`) });
export const bannedWordsSchema = z.object({
  words: z.array(z.string()),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),
  readOnly: z.boolean(), // 테스트 운영자는 보기만 한다
});

export const adminChargeSchema = z.object({
  id: z.string(),
  userNickname: z.string(),
  honey: z.number(),
  amount: z.number(),
  status: z.enum(["pending", "done", "failed", "canceling", "canceled"]),
  paymentKey: z.string().nullable(),
  masked: z.boolean(),
  createdAt: z.string(),
  cancelRequestedAt: z.string().nullable(),
  stuck: z.boolean(), // "취소 중"으로 멈춰 정리할 수 있는 건
});
export type AdminCharge = z.output<typeof adminChargeSchema>;

export const jobRunSchema = z.object({
  id: z.string(),
  jobName: z.string(),
  mode: z.string(),
  adminNickname: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  streamerCount: z.number(),
  result: z.string(),
});
export type JobRun = z.output<typeof jobRunSchema>;

export const adminBroadcastSchema = z.object({
  id: z.string(),
  title: z.string(),
  ownerNickname: z.string(),
  status: z.enum(["ready", "live", "ended"]),
  masked: z.boolean(),
  replayPublic: z.boolean().nullable(), // 다시보기가 없으면 null
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  viewerCount: z.number(),
  pendingReports: z.number(), // 이 방송에 대한 처리 안 된 신고 수
});
export type AdminBroadcast = z.output<typeof adminBroadcastSchema>;
export const adminBroadcastsReqSchema = z.object({ status: z.enum(["live", "ended", "all"]).default("live"), q: z.string().trim().optional(), cursor: z.string().optional() });
export const forceEndSchema = z.object({ reason: z.string().trim().min(1, "사유를 적어 주세요").max(200, "사유는 200자까지 쓸 수 있어요") });

const c = <Req extends z.ZodType, Res extends z.ZodType>(method: Contract["method"], path: string, req: Req, res: Res) =>
  ({ method, path, req, res }) satisfies Contract<Req, Res>;
const none = z.object({});
const ok = z.object({ ok: z.literal(true) });

export const adminOpsApi = {
  createAppeal: c("POST", "/api/me/sanctions/:id/appeal", appealContentSchema, ok),
  adminAppeals: c("GET", "/api/admin/appeals", none, z.object({ items: z.array(adminAppealSchema) })),
  resolveAppeal: c("POST", "/api/admin/appeals/:id/resolve", resolveAppealSchema, ok),

  bannedWords: c("GET", "/api/admin/banned-words", none, bannedWordsSchema),
  addBannedWord: c("POST", "/api/admin/banned-words/add", bannedWordInputSchema, bannedWordsSchema),
  removeBannedWord: c("POST", "/api/admin/banned-words/remove", bannedWordInputSchema, bannedWordsSchema),

  adminCharges: c("GET", "/api/admin/charges", none, z.object({ items: z.array(adminChargeSchema) })),
  reconcileCharge: c("POST", "/api/admin/charges/:id/reconcile", none, z.object({ status: z.enum(["canceled", "reverted", "canceling"]) })),
  adminJobs: c("GET", "/api/admin/jobs", none, z.object({ items: z.array(jobRunSchema) })),
  adminBroadcasts: c("GET", "/api/admin/broadcasts", adminBroadcastsReqSchema, z.object({ items: z.array(adminBroadcastSchema), next: z.string().nullable(), counts: z.object({ live: z.number() }) })),
  forceEndBroadcast: c("POST", "/api/admin/broadcasts/:id/end", forceEndSchema, ok),
  privateReplay: c("POST", "/api/admin/broadcasts/:id/private-replay", forceEndSchema, ok),
} as const;
