import { requireAdmin } from "@nabi/core/application/admin.ts";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { adminOps } from "@/server/moderation";

export const POST = route(moderationApi.adminResolve, async ({ req, body, params }) => {
  await adminOps().resolve(await requireAdmin(authHeader(req)), params.userId!, body);
  return { ok: true as const };
});
