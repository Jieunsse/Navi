import { broadcasts, requireUser } from "@nabi/core";
import { api } from "@nabi/shared";
import { authHeader, route } from "@/server/route";

export const POST = route(api.confirmLive, async ({ req, params }) => ({
  status: await broadcasts().confirmLiveByOwner(await requireUser(authHeader(req)), params.id!),
}));
