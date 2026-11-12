import { signupGoogle } from "@nabi/core";
import { accountApi } from "@nabi/shared/account.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(accountApi.signupGoogle, async ({ req, body }) => {
  await signupGoogle(authHeader(req), body.nickname);
  return { ok: true as const };
});
