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

/** 탈퇴 전 확인 창에 보여줄 것: 남은 꿀과 받지 못한 수익 배분금(4-8, 4-11) */
export const withdrawPreviewSchema = z.object({
  honey: z.object({
    balance: z.number(), // 포기하게 되는 남은 꿀 전부
    refundable: z.number(), // 환급 신청할 수 있는 꿀
    payout: z.number(), // 그 꿀의 환급 받을 금액
    cancelableHoney: z.number(), // 충전 취소로 전액 돌려받을 수 있는 꿀
  }),
  earnings: z.object({ amount: z.number(), payoutDate: z.iso.datetime() }), // 받지 못한 수익 배분금과 다음 지급일
});
export type WithdrawPreview = z.infer<typeof withdrawPreviewSchema>;

export const withdrawInputSchema = z.object({ abandonHoney: z.boolean().default(false), abandonEarnings: z.boolean().default(false) });

export const accountApi = {
  signupGoogle: c("POST", "/api/auth/signup-google", z.object({ nickname: nicknameSchema, agreements: agreementsSchema }), ok),
  profile: c("GET", "/api/me/profile", none, z.object({ nicknameChanged: z.boolean() })),
  changeNickname: c("PATCH", "/api/me/nickname", z.object({ nickname: nicknameSchema }), ok),
  myDonations: c("GET", "/api/me/donations", none, z.object({ items: z.array(myDonationSchema), total: z.number() })),
  withdrawPreview: c("GET", "/api/me/withdraw", none, withdrawPreviewSchema),
  withdraw: c("POST", "/api/me/withdraw", withdrawInputSchema, ok),
} as const;
