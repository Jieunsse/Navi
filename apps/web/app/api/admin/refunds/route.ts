import { requireAdmin } from "@nabi/core/application/admin.ts";
import { refundUseCases } from "@nabi/core/application/refund.ts";
import { adminRefundApi } from "@nabi/shared/honey.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(adminRefundApi.list, async ({ req }) => {
  const admin = await requireAdmin(authHeader(req));
  return { items: await refundUseCases().list(admin), isTestAdmin: !!admin.user.isTestAdmin };
});
