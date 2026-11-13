import { requireUser, withdraw, withdrawPreview } from "@nabi/core";
import { accountApi } from "@nabi/shared/account.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(accountApi.withdrawPreview, async ({ req }) => withdrawPreview(await requireUser(authHeader(req))));

export const POST = route(accountApi.withdraw, async ({ req, body }) => {
  await withdraw(await requireUser(authHeader(req)), body);
  return { ok: true as const };
});
