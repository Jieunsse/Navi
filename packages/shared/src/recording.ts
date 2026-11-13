import { z } from "zod";
import type { Contract } from "./contracts.ts";
import { broadcastSchema } from "./schemas.ts";

// 녹화 약속과 숫자 규칙(07 4-9). 임시값은 여기서만 바꾼다.
export const RECORDING_MAX_MS = 3 * 60_000; // 한 번에 녹화하는 길이
export const RECORDING_MONTHLY_LIMIT_MS = 50 * 60_000; // 한 달 합계(LiveKit 무료 60분보다 작게)
export const RECORDING_PROCESSING_TIMEOUT_MS = 30 * 60_000; // "처리 중"으로 이만큼 지나면 실패
export const PLAY_URL_TTL_SEC = 30 * 60; // 서명된 재생 주소를 쓸 수 있는 시간

export const recordingStatusSchema = z.enum(["recording", "processing", "ready", "failed"]);
export type RecordingStatus = z.infer<typeof recordingStatusSchema>;
export const recordingStatusLabel: Record<RecordingStatus, string> = {
  recording: "녹화 중",
  processing: "처리 중",
  ready: "볼 수 있음",
  failed: "실패",
};

export const recordingSchema = z.object({
  id: z.string(),
  broadcastId: z.string(),
  ownerId: z.string(),
  ownerNickname: z.string(),
  broadcastTitle: z.string(),
  status: recordingStatusSchema,
  isPublic: z.boolean(),
  durationMs: z.number().nullable(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  isExample: z.boolean().default(false), // 시드 다시보기는 화면에 "예시"를 붙인다(4-18)
});
export type Recording = z.infer<typeof recordingSchema>;

/** 후원 한 건. 익명이면 후원자 이름을 "익명"으로 내려준다. */
export const studioDonationSchema = z.object({
  id: z.string(),
  broadcastId: z.string(),
  broadcastTitle: z.string(),
  donor: z.string(),
  kind: z.enum(["chat", "mission"]),
  missionStatus: z.enum(["success", "failed"]).nullable(), // 확정된 미션만(성공=상금, 실패=응원금)
  amount: z.number(),
  delivered: z.number(),
  shareRate: z.number(), // 0.8 같은 값
  earning: z.number(), // 방송자 예상 수익
  createdAt: z.iso.datetime(),
});
export type StudioDonation = z.infer<typeof studioDonationSchema>;

export const studioItemSchema = z.object({
  broadcast: broadcastSchema,
  recording: recordingSchema.nullable(),
  donationTotal: z.number(),
  donations: z.array(studioDonationSchema),
});
export type StudioItem = z.infer<typeof studioItemSchema>;

const none = z.object({});
const ok = z.object({ ok: z.literal(true) });
const c = <Req extends z.ZodType, Res extends z.ZodType>(method: Contract["method"], path: string, req: Req, res: Res) =>
  ({ method, path, req, res }) satisfies Contract<Req, Res>;

export const recordingApi = {
  /** 송출 화면이 녹화 시작 3분 뒤에 부른다 */
  stopRecording: c("POST", "/api/broadcasts/:id/recording/stop", none, ok),
  /** 방송에 붙은 공개 녹화(종료된 방송 화면의 "다시보기" 버튼용). 없으면 null */
  broadcastReplay: c("GET", "/api/broadcasts/:id/replay", none, z.object({ recordingId: z.string().nullable() })),
  listReplays: c("GET", "/api/recordings", none, z.object({ items: z.array(recordingSchema) })),
  getReplay: c(
    "GET",
    "/api/recordings/:id",
    none,
    z.object({
      recording: recordingSchema,
      playUrl: z.string(),
      broadcast: z.object({ sourceType: z.string(), donationTotal: z.number(), donationCount: z.number() }),
    }),
  ),
  setRecordingPublic: c("PATCH", "/api/recordings/:id", z.object({ isPublic: z.boolean() }), ok),
  deleteRecording: c("DELETE", "/api/recordings/:id", none, ok),
  /** 내 방송 관리: 끝난 방송, 녹화, 후원 목록과 지운 방송의 후원 */
  studio: c(
    "GET",
    "/api/recordings/studio",
    none,
    z.object({ ended: z.array(studioItemSchema), deletedDonations: z.array(studioDonationSchema) }),
  ),
} as const;
