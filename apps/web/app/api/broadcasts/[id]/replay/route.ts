import { recordings } from "@nabi/core/container.ts";
import { recordingApi } from "@nabi/shared/recording.ts";
import { route } from "@/server/route";

export const GET = route(recordingApi.broadcastReplay, async ({ params }) => ({ recordingId: await recordings().publicRecordingOf(params.id!) }));
