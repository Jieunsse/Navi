import { broadcasts, requireUser } from "@nabi/core";
import { api } from "@nabi/shared";
import { authHeader, route } from "@/server/route";

export const GET = route(api.myBroadcasts, async ({ req }) => ({ items: await broadcasts().listMine(await requireUser(authHeader(req))) }));
