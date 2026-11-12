import { signup } from "@nabi/core";
import { api } from "@nabi/shared";
import { route } from "@/server/route";

export const POST = route(api.signup, async ({ body }) => {
  await signup(body);
  return { ok: true as const };
});
