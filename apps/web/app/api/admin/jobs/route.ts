import { requireAdmin } from "@nabi/core/application/admin.ts";
import { adminOpsApi } from "@nabi/shared/adminOps.ts";
import { adminOpsServer } from "@/server/adminOps";
import { authHeader, route } from "@/server/route";

export const GET = route(adminOpsApi.adminJobs, async ({ req }) => {
  await requireAdmin(authHeader(req));
  return { items: await adminOpsServer().jobs() };
});
