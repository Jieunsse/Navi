import { z } from "zod";
import { myAppealSchema } from "./adminOps.ts";
import type { Contract } from "./contracts.ts";

// 신고·활동 제한·운영자 제재 약속(4-13~4-15). 숫자는 임시값이라 여기서만 바꾼다.
export const REPORT_DAILY_LIMIT = 20;
export const REPORT_DETAIL_MAX = 200;
export const CHAT_BAN_MEMO_MAX = 100;
export const ADMIN_REASON_MAX = 200;
export const MASKED_NICKNAME = "심사용이 아닌 계정";
export const TEST_ADMIN_SCOPE_MESSAGE = "테스트 운영자는 심사용 계정만 보고 조치할 수 있어요";
/** 테스트 운영자가 제재할 수 없는 시드 계정 종류(4-15, 4-18) */
export const PROTECTED_SEED_KINDS: readonly string[] = ["testBroadcaster", "testViewer", "testAdmin", "sample"];
export const TEST_ACCOUNT_PROTECTED_MESSAGE = "심사용 테스트 계정은 제재할 수 없어요";

export const reportTargetSchema = z.enum(["chat", "broadcast", "user"]);
export const REPORT_REASONS = {
  abuse: "욕설·비하",
  sexual: "성적인 내용",
  spam: "도배·광고",
  impersonation: "사칭",
  illegal: "불법·위험한 행동",
  other: "기타",
} as const;
export const reportReasonSchema = z.enum(["abuse", "sexual", "spam", "impersonation", "illegal", "other"]);
export const reportStatusSchema = z.enum(["pending", "actioned", "dismissed"]);
export const REPORT_STATUS_LABEL = { pending: "접수됨", actioned: "조치했어요", dismissed: "위반이 확인되지 않았어요" } as const;

export const createReportSchema = z
  .object({
    targetType: reportTargetSchema,
    targetId: z.string().min(1).max(200).regex(/^[^/]+$/, "대상이 올바르지 않아요"), // 채팅: 메시지 번호, 방송: 방송 ID, 사용자: 사용자 ID
    broadcastId: z.string().min(1).max(200).optional(), // 채팅 신고일 때 필요하다
    reason: reportReasonSchema,
    detail: z.string().trim().max(REPORT_DETAIL_MAX, `설명은 ${REPORT_DETAIL_MAX}자까지 쓸 수 있어요`).default(""),
  })
  .refine((v) => v.reason !== "other" || v.detail.length > 0, { path: ["detail"], message: "기타를 고르면 설명을 적어 주세요" })
  .refine((v) => v.targetType !== "chat" || !!v.broadcastId, { path: ["broadcastId"], message: "방송 정보가 필요해요" });

export const myReportSchema = z.object({
  id: z.string(),
  targetType: reportTargetSchema,
  label: z.string(),
  reason: reportReasonSchema,
  createdAt: z.string(),
  status: reportStatusSchema,
});
export type MyReport = z.output<typeof myReportSchema>;

// 방송자 활동 제한(4-14)
export const chatBanDurationSchema = z.enum(["1d", "7d", "perm"]);
export const CHAT_BAN_LABEL = { "1d": "1일", "7d": "7일", perm: "영구" } as const;
export const chatBanSchema = z.object({
  userId: z.string(),
  nickname: z.string(),
  duration: chatBanDurationSchema,
  endAt: z.string().nullable(),
  memo: z.string(),
  createdAt: z.string(),
});
export type ChatBan = z.output<typeof chatBanSchema>;
export const chatBanInputSchema = z.object({
  userId: z.string().min(1),
  duration: chatBanDurationSchema,
  memo: z.string().trim().max(CHAT_BAN_MEMO_MAX, `메모는 ${CHAT_BAN_MEMO_MAX}자까지 쓸 수 있어요`).default(""),
});

// 운영자 제재(4-15)
export const sanctionKindSchema = z.enum(["warning", "chatBan", "broadcastBan", "suspend"]);
export const SANCTION_LABEL = { warning: "경고", chatBan: "채팅 금지", broadcastBan: "방송 금지", suspend: "영구 정지" } as const;
/** 기간을 고를 수 있는 제재의 일수. 경고와 영구 정지는 기간이 없다. */
export const SANCTION_DAYS = { chatBan: [1, 7], broadcastBan: [7, 30] } as const;
export const sanctionStatusSchema = z.enum(["active", "ended", "revoked", "appealCanceled"]);
export const SANCTION_STATUS_LABEL = { active: "적용 중", ended: "끝남", revoked: "해제", appealCanceled: "이의로 취소" } as const;

const adminReason = z.string().trim().min(1, "사유를 적어 주세요").max(ADMIN_REASON_MAX, `사유는 ${ADMIN_REASON_MAX}자까지 쓸 수 있어요`);
export const sanctionInputSchema = z.object({
  kind: sanctionKindSchema,
  days: z.number().int().optional(),
  reason: adminReason,
});

export const sanctionItemSchema = z.object({
  id: z.string(),
  kind: sanctionKindSchema,
  startAt: z.string(),
  endAt: z.string().nullable(),
  reason: z.string(),
  status: sanctionStatusSchema, // 끝나는 시각이 지났으면 서버가 "끝남"으로 바꿔 내려준다
  revokeReason: z.string().nullable(),
  appeal: myAppealSchema.nullish(), // 이의 제기를 했으면 그 상태(4-15)
});
export type SanctionItem = z.output<typeof sanctionItemSchema>;

// 운영자 화면
const userBrief = z.object({
  uid: z.string(),
  nickname: z.string(),
  email: z.string().nullable(),
  grade: z.string(),
  seedKind: z.string().nullable(),
  isAdmin: z.boolean(),
  masked: z.boolean(), // 테스트 운영자에게 실제 사용자는 가려서 준다
  suspended: z.boolean(),
  chatBannedUntil: z.string().nullable(),
  broadcastBannedUntil: z.string().nullable(),
});
export type AdminUser = z.output<typeof userBrief>;

export const adminReportGroupSchema = z.object({
  userId: z.string(),
  nickname: z.string(),
  masked: z.boolean(),
  count: z.number(),
  latestReason: reportReasonSchema,
  firstAt: z.string(),
  status: z.enum(["pending", "done"]),
});
export const adminReportItemSchema = z.object({
  id: z.string(),
  targetType: reportTargetSchema,
  targetLabel: z.string(), // 채팅 원문 사본, 방송 제목, 사용자 닉네임
  broadcastId: z.string().nullable(),
  reason: reportReasonSchema,
  detail: z.string(),
  reporterNickname: z.string(),
  createdAt: z.string(),
  status: reportStatusSchema,
  canHide: z.boolean(),
});
export const resolveSchema = z.object({
  action: z.enum(["sanction", "hide", "dismiss"]),
  reason: adminReason,
  sanction: z.object({ kind: sanctionKindSchema, days: z.number().int().optional() }).optional(),
  reportId: z.string().optional(), // "콘텐츠만 숨기기"가 숨길 신고
});
export const adminLogSchema = z.object({
  id: z.string(),
  adminNickname: z.string(),
  action: z.string(),
  targetLabel: z.string(),
  reason: z.string(),
  before: z.string(),
  after: z.string(),
  createdAt: z.string(),
});

const c = <Req extends z.ZodType, Res extends z.ZodType>(method: Contract["method"], path: string, req: Req, res: Res) =>
  ({ method, path, req, res }) satisfies Contract<Req, Res>;
const none = z.object({});
const ok = z.object({ ok: z.literal(true) });

export const moderationApi = {
  createReport: c("POST", "/api/reports", createReportSchema, ok),
  myReports: c("GET", "/api/me/reports", none, z.object({ items: z.array(myReportSchema) })),
  mySanctions: c("GET", "/api/me/sanctions", none, z.object({ items: z.array(sanctionItemSchema) })),
  ackWarnings: c("POST", "/api/me/sanctions/ack", none, ok),

  banChat: c("POST", "/api/me/chat-bans", chatBanInputSchema, ok),
  listChatBans: c("GET", "/api/me/chat-bans", none, z.object({ items: z.array(chatBanSchema) })),
  unbanChat: c("DELETE", "/api/me/chat-bans/:userId", none, ok),

  adminDashboard: c(
    "GET",
    "/api/admin/dashboard",
    none,
    z.object({ isTestAdmin: z.boolean(), broadcastsToday: z.number(), liveNow: z.number(), donationToday: z.number(), pendingReports: z.number(), pendingRefunds: z.number(), pendingAppeals: z.number() }),
  ),
  adminReports: c("GET", "/api/admin/reports", none, z.object({ items: z.array(adminReportGroupSchema) })),
  adminReportDetail: c(
    "GET",
    "/api/admin/reports/:userId",
    none,
    z.object({ user: userBrief, reports: z.array(adminReportItemSchema), sanctions: z.array(sanctionItemSchema) }),
  ),
  adminResolve: c("POST", "/api/admin/reports/:userId/resolve", resolveSchema, ok),
  adminUsers: c("GET", "/api/admin/users", none, z.object({ items: z.array(userBrief) })),
  adminUserDetail: c("GET", "/api/admin/users/:userId", none, z.object({ user: userBrief, sanctions: z.array(sanctionItemSchema), reportCount: z.number() })),
  adminSanction: c("POST", "/api/admin/users/:userId/sanctions", sanctionInputSchema, ok),
  adminRevoke: c("POST", "/api/admin/sanctions/:id/revoke", z.object({ reason: adminReason }), ok),
  adminLogs: c("GET", "/api/admin/logs", none, z.object({ items: z.array(adminLogSchema) })),
} as const;
