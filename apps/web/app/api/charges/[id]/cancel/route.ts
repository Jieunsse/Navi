import { requireUser } from "@nabi/core";
import { honey } from "@nabi/core/application/honey.ts";
import { honeyApi } from "@nabi/shared/honey.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(honeyApi.cancelCharge, async ({ req, params }) => honey().cancelCharge(await requireUser(authHeader(req)), params.id!));
