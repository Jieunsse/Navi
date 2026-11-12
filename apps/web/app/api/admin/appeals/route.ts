import { requireAdmin } from "@nabi/core/application/admin.ts";
import { appealUseCases } from "@nabi/core/application/appeal.ts";
import { adminOpsApi } from "@nabi/shared/adminOps.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(adminOpsApi.adminAppeals, async ({ req }) => ({ items: await appealUseCases.adminList(await requireAdmin(authHeader(req))) }));
