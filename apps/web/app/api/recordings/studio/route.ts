import { requireUser } from "@nabi/core";
import { recordings } from "@nabi/core/container.ts";
import { recordingApi } from "@nabi/shared/recording.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(recordingApi.studio, async ({ req }) => recordings().studio(await requireUser(authHeader(req))));
