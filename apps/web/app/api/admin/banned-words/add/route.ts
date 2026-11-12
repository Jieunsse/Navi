import { requireAdmin } from "@nabi/core/application/admin.ts";
import { bannedWordsAdmin } from "@nabi/core/application/bannedWords.ts";
import { adminOpsApi } from "@nabi/shared/adminOps.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(adminOpsApi.addBannedWord, async ({ req, body }) => bannedWordsAdmin.change(await requireAdmin(authHeader(req)), body.word, true));
