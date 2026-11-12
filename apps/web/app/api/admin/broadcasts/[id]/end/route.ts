import { requireAdmin } from "@nabi/core/application/admin.ts";
import { adminOpsApi } from "@nabi/shared/adminOps.ts";
import { adminOpsServer } from "@/server/adminOps";
import { authHeader, route } from "@/server/route";

export const POST = route(adminOpsApi.forceEndBroadcast, async ({ req, body, params }) => {
  await adminOpsServer().forceEnd(await requireAdmin(authHeader(req)), params.id!, body.reason);
  return { ok: true as const };
});
