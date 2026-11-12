import { broadcasts, requireUser } from "@nabi/core";
import { api } from "@nabi/shared";
import { authHeader, route } from "@/server/route";

export const POST = route(api.createBroadcast, async ({ req, body }) => broadcasts().create(await requireUser(authHeader(req)), body));
