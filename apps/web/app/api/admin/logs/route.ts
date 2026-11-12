import { requireAdmin } from "@nabi/core/application/admin.ts";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { adminOps } from "@/server/moderation";

export const GET = route(moderationApi.adminLogs, async ({ req }) => ({ items: await adminOps().logs(await requireAdmin(authHeader(req))) }));
