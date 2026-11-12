import { requireAdmin } from "@nabi/core/application/admin.ts";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { adminOps } from "@/server/moderation";

export const GET = route(moderationApi.adminDashboard, async ({ req }) => adminOps().dashboard(await requireAdmin(authHeader(req))));
