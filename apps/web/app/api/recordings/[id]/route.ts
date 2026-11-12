import { requireUser } from "@nabi/core";
import { recordings } from "@nabi/core/container.ts";
import { recordingApi } from "@nabi/shared/recording.ts";
import { authHeader, route } from "@/server/route";

// 비로그인도 공개 다시보기는 볼 수 있다. 토큰이 없거나 틀리면 비로그인으로 본다(5장).
export const GET = route(recordingApi.getReplay, async ({ req, params }) => {
  const viewer = await requireUser(authHeader(req)).catch(() => null);
  return recordings().getReplay(viewer?.uid ?? null, params.id!);
});

export const PATCH = route(recordingApi.setRecordingPublic, async ({ req, body, params }) => {
  await recordings().setPublic(await requireUser(authHeader(req)), params.id!, body.isPublic);
  return { ok: true as const };
});

export const DELETE = route(recordingApi.deleteRecording, async ({ req, params }) => {
  await recordings().remove(await requireUser(authHeader(req)), params.id!);
  return { ok: true as const };
});
