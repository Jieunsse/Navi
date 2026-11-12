import { requireAdmin } from "@nabi/core/application/admin.ts";
import { appealUseCases } from "@nabi/core/application/appeal.ts";
import { adminOpsApi } from "@nabi/shared/adminOps.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(adminOpsApi.resolveAppeal, async ({ req, body, params }) => {
  await appealUseCases.resolve(await requireAdmin(authHeader(req)), params.id!, body);
  return { ok: true as const };
});
