import { requireAdmin } from "@nabi/core/application/admin.ts";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { adminOps } from "@/server/moderation";

export const GET = route(moderationApi.adminReports, async ({ req }) => ({ items: await adminOps().reportGroups(await requireAdmin(authHeader(req))) }));
