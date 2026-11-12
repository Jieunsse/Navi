import { requireUser } from "@nabi/core";
import { refundUseCases } from "@nabi/core/application/refund.ts";
import { honeyApi } from "@nabi/shared/honey.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(honeyApi.requestRefund, async ({ req, body }) => {
  await refundUseCases().apply(await requireUser(authHeader(req)), body);
  return { ok: true as const };
});
