import { requireAdmin } from "@nabi/core/application/admin.ts";
import { settlementApi } from "@nabi/shared/settlement.ts";
import { authHeader, route } from "@/server/route";
import { settlements } from "@/server/settlement";

export const POST = route(settlementApi.adminHold, async ({ req, body, params }) => {
  await settlements().hold(await requireAdmin(authHeader(req)), params.userId!, body.reason);
  return { ok: true as const };
});
