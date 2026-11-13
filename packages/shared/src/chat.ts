import { z } from "zod";
import type { Contract } from "./contracts.ts";

// 채팅 약속(4-7). 글자 수와 도배 간격은 임시값이라 여기서만 바꾼다.
export const CHAT_MAX = 200;
export const CHAT_INTERVAL_MS = 1000;

export const chatKindSchema = z.enum(["chat", "donation", "mission"]);

/** 채팅 모음 문서와 LiveKit 데이터가 같이 쓰는 모양. 후원·미션 항목은 다른 유스케이스가 같은 필드로 쓴다. */
export const chatItemSchema = z.object({
  messageId: z.string(),
  kind: chatKindSchema,
  authorId: z.string().nullish(), // 익명 후원이면 없다
  authorNickname: z.string(), // 익명 후원이면 "익명"
  authorGrade: z.string().nullish(),
  isHost: z.boolean().nullish(),
  content: z.string().default(""), // 숨긴 채팅은 비어 있다
  hidden: z.boolean().default(false),
  createdAt: z.string(), // ISO
  amount: z.number().nullish(),
  missionContent: z.string().nullish(),
  missionStatus: z.string().nullish(),
  deadlineAt: z.string().nullish(),
});
export type ChatItem = z.output<typeof chatItemSchema>;

export const chatSendSchema = z.object({
  messageId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "메시지 번호가 올바르지 않아요"),
  content: z.string().trim().min(1, "채팅을 입력해 주세요").max(CHAT_MAX, `채팅은 ${CHAT_MAX}자까지 쓸 수 있어요`),
});

const c = <Req extends z.ZodType, Res extends z.ZodType>(method: Contract["method"], path: string, req: Req, res: Res) =>
  ({ method, path, req, res }) satisfies Contract<Req, Res>;

export const chatApi = {
  /** 방송 보기 화면용: 방송자의 방송 금지 여부, 로그인한 본인의 채팅 막힘 안내(4-14, 4-15) */
  broadcastAccess: c("GET", "/api/broadcasts/:id/access", z.object({}), z.object({ ownerBroadcastBanned: z.boolean(), chatBlock: z.string().nullable() })),
  /** 사용자 시트용: 시드 샘플 계정이면 화면에 "예시"를 붙인다(4-18) */
  authorExample: c("GET", "/api/broadcasts/:id/authors/:userId/example", z.object({}), z.object({ example: z.boolean() })),
  sendChat: c("POST", "/api/broadcasts/:id/chat", chatSendSchema, chatItemSchema),
} as const;
