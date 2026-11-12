import "server-only";
import { createTransfer } from "@nabi/core/adapters/transfer.ts";
import { settlementUseCases } from "@nabi/core/application/settlement.ts";

/** 송금은 환경 변수(PAYOUT_MODE)로 목업과 실제를 고른다. 지금은 목업만 있다. */
export const settlements = () => settlementUseCases(createTransfer());
