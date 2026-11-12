import "server-only";
import { broadcasts, livekit } from "@nabi/core";
import { adminUseCases } from "@nabi/core/application/admin.ts";
import { moderationUseCases } from "@nabi/core/application/moderation.ts";

export const moderation = () => moderationUseCases();
/** 방송 강제 종료는 기존 end 함수를 그대로 쓴다(07 3장). */
export const adminOps = () => adminUseCases(livekit(), broadcasts().end);
