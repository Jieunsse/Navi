import { requireAdmin } from "@nabi/core/application/admin.ts";
import { refundUseCases } from "@nabi/core/application/refund.ts";
import { adminRefundApi } from "@nabi/shared/honey.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(adminRefundApi.approve, async ({ req, params }) => refundUseCases().approve(await requireAdmin(authHeader(req)), params.id!));
