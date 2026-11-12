import { myDonations, requireUser } from "@nabi/core";
import { accountApi } from "@nabi/shared/account.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(accountApi.myDonations, async ({ req }) => myDonations(await requireUser(authHeader(req))));
