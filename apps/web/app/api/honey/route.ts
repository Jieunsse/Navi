import { requireUser } from "@nabi/core";
import { honey } from "@nabi/core/application/honey.ts";
import { honeyApi } from "@nabi/shared/honey.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(honeyApi.wallet, async ({ req }) => honey().wallet(await requireUser(authHeader(req))));
