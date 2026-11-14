import type { TransferPort } from "./transfer.ts";

/** 계좌 끝 4자리가 이 값이면 송금이 실패한다. "지급 실패" 상태를 실제 지급 함수로 만들기 위한 시드용 계좌다. */
export const SEED_FAILING_LAST4 = "0000";

/** 시드 송금(4-18). 목업 송금과 같지만 실패 예시 계좌로는 보내지 못한다. */
export function createSeedTransfer(): TransferPort {
  return {
    mock: true,
    send: async ({ settlementId, account }) => {
      if (account.last4 === SEED_FAILING_LAST4) throw new Error("은행 점검 중이라 송금하지 못했어요(예시)");
      return { transferId: `MOCK-${settlementId}` };
    },
  };
}
