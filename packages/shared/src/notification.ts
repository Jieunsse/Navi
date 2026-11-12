import { z } from "zod";
import type { Contract } from "./contracts.ts";

// 알림 약속(07 4-17). 임시값은 여기서만 바꾼다.
export const NOTIFICATION_TTL_DAYS = 30; // 30일이 지난 알림은 목록에서 보여주지 않는다(임시)
export const NOTIFICATION_LIST_LIMIT = 30;

export const notificationKindSchema = z.enum(["donation", "mission", "settlement", "promotion", "report", "appeal", "refund", "action"]);
export type NotificationKind = z.output<typeof notificationKindSchema>;

export const notificationSchema = z.object({
  id: z.string(),
  kind: notificationKindSchema,
  text: z.string(),
  href: z.string().nullable(), // 운영 조치 알림은 이동하지 않는다
  refId: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type NotificationItem = z.output<typeof notificationSchema>;

const c = <Req extends z.ZodType, Res extends z.ZodType>(method: Contract["method"], path: string, req: Req, res: Res) =>
  ({ method, path, req, res }) satisfies Contract<Req, Res>;
const none = z.object({});
const ok = z.object({ ok: z.literal(true) });

export const notificationApi = {
  unread: c("GET", "/api/me/notifications/unread", none, z.object({ unread: z.number() })),
  list: c("GET", "/api/me/notifications", none, z.object({ items: z.array(notificationSchema), unread: z.number() })),
  read: c("POST", "/api/me/notifications/:id/read", none, ok),
  readAll: c("POST", "/api/me/notifications/read-all", none, ok),
} as const;
