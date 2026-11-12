import { requireAdmin } from "@nabi/core/application/admin.ts";
import { adminOpsApi } from "@nabi/shared/adminOps.ts";
import { adminOpsServer } from "@/server/adminOps";
import { authHeader, route } from "@/server/route";

export const POST = route(adminOpsApi.reconcileCharge, async ({ req, params }) => adminOpsServer().reconcileCharge(await requireAdmin(authHeader(req)), params.id!));
