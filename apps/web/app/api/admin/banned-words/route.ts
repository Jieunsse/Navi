import { requireAdmin } from "@nabi/core/application/admin.ts";
import { bannedWordsAdmin } from "@nabi/core/application/bannedWords.ts";
import { adminOpsApi } from "@nabi/shared/adminOps.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(adminOpsApi.bannedWords, async ({ req }) => bannedWordsAdmin.view(await requireAdmin(authHeader(req))));
