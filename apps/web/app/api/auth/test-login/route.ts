import { testLoginToken } from "@nabi/core";
import { api } from "@nabi/shared";
import { clientIp, route } from "@/server/route";

export const POST = route(api.testLogin, async ({ req, body }) => ({ token: await testLoginToken(body.account, clientIp(req)) }));
