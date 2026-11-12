import { requireUser } from "@nabi/core";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { moderation } from "@/server/moderation";

export const GET = route(moderationApi.myReports, async ({ req }) => ({ items: await moderation().myReports(await requireUser(authHeader(req))) }));
