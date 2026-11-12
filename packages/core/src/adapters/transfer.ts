// 송금 입구(07 4-12). 정산 기록 하나와 계좌를 받아 송금 번호를 돌려준다. 실제 구현과 목업이 이 모양을 같이 쓴다.
export type TransferInput = {
  settlementId: string;
  amount: number;
  account: { bank: string; last4: string; holder: string };
};
export type TransferPort = {
  /** 목업이면 true. 정산 기록에 남겨 화면에서 "(테스트)"를 붙인다. */
  mock: boolean;
  send(input: TransferInput): Promise<{ transferId: string }>;
};

/** 외부를 부르지 않고 `MOCK-` 송금 번호를 만들어 성공으로 돌려준다. */
const mockTransfer: TransferPort = {
  mock: true,
  send: async ({ settlementId }) => ({ transferId: `MOCK-${settlementId}` }),
};

/** PAYOUT_MODE=mock(기본)이면 목업. 실제 구현은 결제대행사 지급대행 API로 나중에 만든다. */
export function createTransfer(): TransferPort {
  const mode = process.env.PAYOUT_MODE ?? "mock";
  if (mode === "mock") return mockTransfer;
  throw new Error(`실제 송금(PAYOUT_MODE=${mode})은 아직 만들지 않았어요`);
}
