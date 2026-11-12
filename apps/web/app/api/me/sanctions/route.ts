import { requireUser } from "@nabi/core";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { moderation } from "@/server/moderation";

export const GET = route(moderationApi.mySanctions, async ({ req }) => ({ items: await moderation().mySanctions(await requireUser(authHeader(req))) }));
