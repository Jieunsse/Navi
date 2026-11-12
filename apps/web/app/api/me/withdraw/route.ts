import { requireUser, withdraw } from "@nabi/core";
import { accountApi } from "@nabi/shared/account.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(accountApi.withdraw, async ({ req }) => {
  await withdraw(await requireUser(authHeader(req)));
  return { ok: true as const };
});
