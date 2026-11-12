import { requireUser } from "@nabi/core";
import { notificationUseCases } from "@nabi/core/application/notification.ts";
import { notificationApi } from "@nabi/shared/notification.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(notificationApi.unread, async ({ req }) => notificationUseCases().unread(await requireUser(authHeader(req))));
