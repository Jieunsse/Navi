import { z } from "zod";
import { categorySchema } from "./category.ts";
import { NICKNAME_RE, TITLE_MAX } from "./rules.ts";

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "닉네임을 입력해 주세요")
  .regex(NICKNAME_RE, "닉네임은 한글, 영문, 숫자로 2~12자예요");

export const agreementsSchema = z.object({
  age14: z.literal(true),
  terms: z.literal(true),
  streamerTerms: z.literal(true),
  privacy: z.literal(true),
});

export const signupSchema = z.object({
  email: z.email("이메일 형식으로 입력해 주세요"),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 해요"),
  nickname: nicknameSchema,
  agreements: agreementsSchema,
});

export const broadcastStatusSchema = z.enum(["ready", "live", "ended"]);
export const sourceTypeSchema = z.enum(["screen", "camera"]);
export const titleSchema = z.string().trim().min(1, "제목을 입력해 주세요").max(TITLE_MAX, `제목은 ${TITLE_MAX}자까지예요`);

export const broadcastSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  ownerNickname: z.string(),
  title: z.string(),
  sourceType: sourceTypeSchema,
  viewerCount: z.number().optional(), // 없으면 0명으로 본다
  category: categorySchema.optional(), // 없으면 "잡담"으로 본다
  status: broadcastStatusSchema,
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
});
export type Broadcast = z.infer<typeof broadcastSchema>;
export type BroadcastStatus = z.infer<typeof broadcastStatusSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const meSchema = z.object({
  uid: z.string(),
  nickname: z.string(),
  email: z.string().nullable(),
  grade: z.string(),
  isAdmin: z.boolean(),
  seedKind: z.string().nullable(),
});
export type Me = z.infer<typeof meSchema>;
