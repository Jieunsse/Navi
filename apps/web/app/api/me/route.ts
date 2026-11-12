import { requireUser, toMe } from "@nabi/core";
import { api } from "@nabi/shared";
import { authHeader, route } from "@/server/route";

export const GET = route(api.me, async ({ req }) => toMe(await requireUser(authHeader(req))));
