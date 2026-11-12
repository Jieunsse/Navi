import { requireUser } from "@nabi/core";
import { appealUseCases } from "@nabi/core/application/appeal.ts";
import { adminOpsApi } from "@nabi/shared/adminOps.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(adminOpsApi.createAppeal, async ({ req, body, params }) => {
  await appealUseCases.create(await requireUser(authHeader(req)), params.id!, body.content);
  return { ok: true as const };
});
