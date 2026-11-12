import { z } from "zod";
import type { Contract } from "./contracts.ts";

// 심사용 테스트 계정과 초기화 약속(07 4-18). 계정 ID와 로그인 정보는 시드, 화면, README가 같은 값을 쓴다.
export const SEED_UIDS = {
  broadcaster: "seed-test-broadcaster",
  viewer: "seed-test-viewer",
  admin: "seed-test-admin",
  practice: "seed-practice",
  suspended: "seed-suspended",
  harin: "seed-sample-harin",
  minsu: "seed-sample-minsu",
  jiwoo: "seed-sample-jiwoo",
  seoyeon: "seed-sample-seoyeon",
} as const;

/** README로 들어가는 두 계정. 심사용이라 비밀번호가 공개돼도 괜찮다. */
export const SEED_LOGINS = {
  practice: { email: "practice@nabi.test", password: "nabi-test-2026" },
  suspended: { email: "suspended@nabi.test", password: "nabi-test-2026" },
} as const;

/** 사용자 문서의 seedKind 값과 화면 이름 */
export const SEED_KIND_LABEL: Record<string, string> = {
  testBroadcaster: "테스트 방송자",
  testViewer: "테스트 시청자",
  testAdmin: "테스트 운영자",
  sanctionPractice: "제재 연습용",
  suspendedExample: "정지 예시",
  sample: "샘플",
};

export const FULL_RESET_INTERVAL_MS = 10 * 60 * 1000; // 테스트 운영자의 전체 초기화 간격(06 결정 25)
export const SEED_RENAMED = "초기화된 심사용 계정";

export const seedTargetSchema = z.enum(["viewer", "broadcaster", "practice"]);
export const SEED_TARGET_LABEL = {
  viewer: "테스트 시청자: 꿀을 0으로",
  broadcaster: "테스트 방송자: 승급 직전으로",
  practice: "제재 연습용: 신고 4건·제재 없음·꿀 5,000으로",
} as const;

export const seedAccountSchema = z.object({
  uid: z.string(),
  nickname: z.string(),
  kind: z.string(),
  grade: z.string(),
  honey: z.number(),
  broadcastCount: z.number(),
  totalBroadcastMs: z.number(),
  donationCount: z.number(),
  suspended: z.boolean(),
  chatBannedUntil: z.string().nullable(),
});
export type SeedAccount = z.output<typeof seedAccountSchema>;

const c = <Req extends z.ZodType, Res extends z.ZodType>(method: Contract["method"], path: string, req: Req, res: Res) =>
  ({ method, path, req, res }) satisfies Contract<Req, Res>;
const none = z.object({});
const message = z.object({ message: z.string() });

export const seedApi = {
  adminList: c(
    "GET",
    "/api/admin/test-accounts",
    none,
    z.object({ accounts: z.array(seedAccountSchema), resetting: z.boolean(), lastFullResetAt: z.string().nullable(), nextFullResetAt: z.string().nullable() }),
  ),
  adminPartialReset: c("POST", "/api/admin/test-accounts/reset", z.object({ target: seedTargetSchema }), message),
  adminFullReset: c("POST", "/api/admin/test-accounts/reset-all", none, message),
} as const;
