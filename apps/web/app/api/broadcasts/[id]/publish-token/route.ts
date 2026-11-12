import { broadcasts, requireUser } from "@nabi/core";
import { api } from "@nabi/shared";
import { authHeader, route } from "@/server/route";

export const POST = route(api.publishToken, async ({ req, body, params }) =>
  broadcasts().publishToken(await requireUser(authHeader(req)), params.id!, body.recordingEnabled),
);
