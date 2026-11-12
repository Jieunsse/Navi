import { requireUser } from "@nabi/core";
import { settlementApi } from "@nabi/shared/settlement.ts";
import { authHeader, route } from "@/server/route";
import { settlements } from "@/server/settlement";

export const GET = route(settlementApi.mine, async ({ req }) => settlements().mine(await requireUser(authHeader(req))));
