import { requireUser } from "@nabi/core";
import { honey } from "@nabi/core/application/honey.ts";
import { honeyApi } from "@nabi/shared/honey.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(honeyApi.verifyIdentity, async ({ req, body }) => honey().verifyIdentity(await requireUser(authHeader(req)), body));
