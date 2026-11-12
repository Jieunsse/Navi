import { checkNickname } from "@nabi/core";
import { api } from "@nabi/shared";
import { route } from "@/server/route";

export const POST = route(api.checkNickname, async ({ body }) => {
  await checkNickname(body.nickname);
  return { ok: true as const };
});
