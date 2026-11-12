import { changeNickname, requireUser } from "@nabi/core";
import { accountApi } from "@nabi/shared/account.ts";
import { authHeader, route } from "@/server/route";

export const PATCH = route(accountApi.changeNickname, async ({ req, body }) => {
  await changeNickname(await requireUser(authHeader(req)), body.nickname);
  return { ok: true as const };
});
