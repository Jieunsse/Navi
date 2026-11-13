import { requireAdmin } from "@nabi/core/application/admin.ts";
import { adminOpsApi } from "@nabi/shared/adminOps.ts";
import { adminOpsServer } from "@/server/adminOps";
import { authHeader, route } from "@/server/route";

export const POST = route(adminOpsApi.privateReplay, async ({ req, body, params }) => {
  await adminOpsServer().privateReplay(await requireAdmin(authHeader(req)), params.id!, body.reason);
  return { ok: true as const };
});
