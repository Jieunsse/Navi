import { requireAdmin } from "@nabi/core/application/admin.ts";
import { settlementApi } from "@nabi/shared/settlement.ts";
import { authHeader, route } from "@/server/route";
import { settlements } from "@/server/settlement";

export const GET = route(settlementApi.adminList, async ({ req }) => settlements().adminList(await requireAdmin(authHeader(req))));
