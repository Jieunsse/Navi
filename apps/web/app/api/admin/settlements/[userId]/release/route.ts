import { requireAdmin } from "@nabi/core/application/admin.ts";
import { settlementApi } from "@nabi/shared/settlement.ts";
import { authHeader, route } from "@/server/route";
import { settlements } from "@/server/settlement";

export const POST = route(settlementApi.adminRelease, async ({ req, body, params }) => {
  await settlements().release(await requireAdmin(authHeader(req)), params.userId!, body.reason);
  return { ok: true as const };
});
