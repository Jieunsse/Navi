import { myProfile, requireUser } from "@nabi/core";
import { accountApi } from "@nabi/shared/account.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(accountApi.profile, async ({ req }) => myProfile(await requireUser(authHeader(req))));
