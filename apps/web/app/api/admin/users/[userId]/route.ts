import { requireAdmin } from "@nabi/core/application/admin.ts";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { adminOps } from "@/server/moderation";

export const GET = route(moderationApi.adminUserDetail, async ({ req, params }) => adminOps().userDetail(await requireAdmin(authHeader(req)), params.userId!));
