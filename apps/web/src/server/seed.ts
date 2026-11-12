import "server-only";
import { broadcasts } from "@nabi/core";
import { seedUseCases } from "@nabi/core/application/seed.ts";

/** 테스트 계정 초기화(4-18). `pnpm seed --reset`과 같은 함수를 부른다. 시드 방송을 끝낼 때는 기존 방송 종료 함수를 쓴다. */
export const seedServer = () => seedUseCases({ end: broadcasts().end });
