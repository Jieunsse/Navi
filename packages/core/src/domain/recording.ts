import { RECORDING_MAX_MS, RECORDING_MONTHLY_LIMIT_MS, RECORDING_PROCESSING_TIMEOUT_MS, type RecordingStatus } from "@nabi/shared/recording.ts";

const KST_MS = 9 * 3600_000;

/** usage 문서 ID(예: 2026-11). 한국 시간 기준 달이다. */
export function usageMonth(now: Date) {
  return new Date(now.getTime() + KST_MS).toISOString().slice(0, 7);
}

/** 3분을 미리 더해도 한 달 합계가 50분을 넘지 않을 때만 새 녹화를 시작한다. */
export function canStartRecording(usedMs: number) {
  return usedMs + RECORDING_MAX_MS <= RECORDING_MONTHLY_LIMIT_MS;
}

/** 녹화가 끝나면 미리 더한 3분을 실제 길이로 고친다. 더할 값(음수면 줄인다)을 돌려준다. */
export function usageCorrection(actualMs: number) {
  return Math.max(0, actualMs) - RECORDING_MAX_MS;
}

/** 녹화 중이고 시작 3분이 지났으며 아직 멈춤을 요청하지 않았으면 멈춘다. */
export function shouldStopRecording(r: { status: RecordingStatus; startedAtMs: number; stopRequested: boolean }, nowMs: number) {
  return r.status === "recording" && !r.stopRequested && nowMs - r.startedAtMs >= RECORDING_MAX_MS;
}

/** "처리 중"으로 30분이 지났으면 실패로 본다(결정 27). */
export function shouldFailProcessing(r: { status: RecordingStatus; endedAtMs: number | null }, nowMs: number) {
  return r.status === "processing" && r.endedAtMs !== null && nowMs - r.endedAtMs >= RECORDING_PROCESSING_TIMEOUT_MS;
}

/** 녹화 중이거나 처리 중이면 지울 수 없다. 방송 삭제도 같은 기준이다(4-9, 4-10). */
export const isBusy = (status: RecordingStatus) => status === "recording" || status === "processing";

/** 재생할 수 있는가: 볼 수 있음 상태이고, 공개이거나 소유자일 때(5장). */
export function canPlay(r: { status: RecordingStatus; isPublic: boolean; ownerId: string }, viewerUid: string | null) {
  return r.status === "ready" && (r.isPublic || r.ownerId === viewerUid);
}
