import { requireAdmin } from "@nabi/core/application/admin.ts";
import { refundUseCases } from "@nabi/core/application/refund.ts";
import { adminRefundApi } from "@nabi/shared/honey.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(adminRefundApi.reject, async ({ req, body, params }) => {
  await refundUseCases().reject(await requireAdmin(authHeader(req)), params.id!, body.reason);
  return { ok: true as const };
});
