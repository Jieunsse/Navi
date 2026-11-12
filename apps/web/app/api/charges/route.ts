import { requireUser } from "@nabi/core";
import { honey } from "@nabi/core/application/honey.ts";
import { honeyApi } from "@nabi/shared/honey.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(honeyApi.createCharge, async ({ req, body }) => honey().createCharge(await requireUser(authHeader(req)), body));
