import { requireUser } from "@nabi/core";
import { recordings } from "@nabi/core/container.ts";
import { recordingApi } from "@nabi/shared/recording.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(recordingApi.stopRecording, async ({ req, params }) => {
  await recordings().stopByOwner(await requireUser(authHeader(req)), params.id!);
  return { ok: true as const };
});
