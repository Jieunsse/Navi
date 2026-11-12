import { requireAdmin } from "@nabi/core/application/admin.ts";
import { adminOpsApi } from "@nabi/shared/adminOps.ts";
import { adminOpsServer } from "@/server/adminOps";
import { authHeader, route } from "@/server/route";

export const GET = route(adminOpsApi.adminBroadcasts, async ({ req }) => ({ items: await adminOpsServer().broadcasts(await requireAdmin(authHeader(req))) }));
