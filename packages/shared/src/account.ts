import { z } from "zod";
import { agreementsSchema, nicknameSchema } from "./schemas.ts";

// 구글 가입 마무리와 내 정보 약속(07 4-1, 4-11). contracts.ts와 같은 모양(결정 18).
const c = <Req extends z.ZodType, Res extends z.ZodType>(method: "GET" | "POST" | "PATCH", path: string, req: Req, res: Res) => ({ method, path, req, res }) as const;

const none = z.object({});
const ok = z.object({ ok: z.literal(true) });

export const WITHDRAWN_NICKNAME = "탈퇴한 사용자";
export const REAUTH_WINDOW_MS = 5 * 60 * 1000; // 탈퇴 직전 다시 로그인으로 쳐 주는 시간

export const myDonationSchema = z.object({
  id: z.string(),
  kind: z.enum(["chat", "mission"]),
  broadcastId: z.string(),
  broadcastTitle: z.string(),
  broadcastDeleted: z.boolean(),
  streamerNickname: z.string(),
  amount: z.number(),
  message: z.string(),
  anonymous: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type MyDonation = z.infer<typeof myDonationSchema>;

export const accountApi = {
  signupGoogle: c("POST", "/api/auth/signup-google", z.object({ nickname: nicknameSchema, agreements: agreementsSchema }), ok),
  profile: c("GET", "/api/me/profile", none, z.object({ nicknameChanged: z.boolean() })),
  changeNickname: c("PATCH", "/api/me/nickname", z.object({ nickname: nicknameSchema }), ok),
  myDonations: c("GET", "/api/me/donations", none, z.object({ items: z.array(myDonationSchema), total: z.number() })),
  withdraw: c("POST", "/api/me/withdraw", none, ok),
} as const;
