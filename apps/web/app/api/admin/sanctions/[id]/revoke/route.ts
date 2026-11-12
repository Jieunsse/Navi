import { requireAdmin } from "@nabi/core/application/admin.ts";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { adminOps } from "@/server/moderation";

export const POST = route(moderationApi.adminRevoke, async ({ req, body, params }) => {
  await adminOps().revoke(await requireAdmin(authHeader(req)), params.id!, body.reason);
  return { ok: true as const };
});
