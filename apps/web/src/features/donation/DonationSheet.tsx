"use client";
import { DONATION_MAX, DONATION_MESSAGE_MAX, DONATION_MIN, honeyApi, suggestChargeHoney, type Wallet } from "@nabi/shared/honey.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, cx, Input } from "@/shared/ui";
import { ChargeBox } from "./ChargeBox";
import { NoticeDialog } from "./NoticeDialog";

const won = (n: number) => n.toLocaleString("ko-KR");
const adds = [["+1천", 1_000], ["+1만", 10_000], ["+10만", 100_000], ["+100만", 1_000_000]] as const;

type Props = { broadcastId: string; ownerId: string; status: "ready" | "live" | "ended"; onClose: () => void };

/** 채팅 후원 창. 휴대폰은 아래에서 올라오고, PC도 같은 모양이다(4-8). */
export function DonationSheet({ broadcastId, ownerId, status, onClose }: Props) {
  const { me } = useSession();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  // 후원 창을 열 때 한 번 만든다. 버튼을 두 번 눌러도 서버가 한 번만 처리한다.
  const [requestId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(0);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"donate" | "charge">("donate");
  const [notice, setNotice] = useState(false);
  const [capped, setCapped] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setWallet(await apiFetch(honeyApi.wallet).catch(() => null));
  }, []);
  useEffect(() => {
    if (me) void apiFetch(honeyApi.wallet).then(setWallet, () => undefined);
  }, [me]);

  if (status === "ended") return null; // 종료된 방송에는 후원 버튼이 없다. 서버도 거절한다.

  const balance = wallet?.balance ?? 0;
  const own = me?.uid === ownerId;
  const short = Math.max(0, amount - balance);
  const lacking = amount >= DONATION_MIN && short > 0;
  const setClamped = (n: number) => {
    setCapped(n > DONATION_MAX);
    setAmount(Math.min(n, DONATION_MAX));
  };

  async function donate() {
    setBusy(true);
    setError("");
    try {
      await apiFetch(honeyApi.donate, { requestId, amount, message }, { id: broadcastId });
      toast.success(`${won(amount)}꿀을 후원했어요`);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
      if (e instanceof ApiError && e.code === "INSUFFICIENT") void reload(); // 다른 기기에서 먼저 쓴 경우 잔액을 새로 불러온다
    } finally {
      setBusy(false);
    }
  }

  function startCharge() {
    if (!wallet || suggestChargeHoney(short, wallet.todayRemaining) === null) {
      setError("오늘 충전할 수 있는 한도를 넘어서 충전하고 후원할 수 없어요");
      return;
    }
    setError("");
    setStep("charge");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal aria-label="후원하기" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">후원하기</h2>
          <button onClick={onClose} aria-label="닫기" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2">✕</button>
        </div>

        {!me ? (
          <p className="text-sm text-muted">로그인하면 후원할 수 있어요</p>
        ) : own ? (
          <p className="text-sm text-muted">내 방송에는 후원할 수 없어요</p>
        ) : !wallet ? (
          <p className="py-6 text-center text-sm text-muted">불러오는 중…</p>
        ) : step === "charge" ? (
          <>
            <p className="text-sm">{won(short)}꿀이 모자라서 충전하고 바로 후원해요. 충전할 꿀은 바꿀 수 있어요.</p>
            <ChargeBox
              wallet={wallet}
              reload={reload}
              returnTo={`/live/${broadcastId}`}
              initialHoney={suggestChargeHoney(short, wallet.todayRemaining) ?? undefined}
              donation={{ broadcastId, requestId, amount, message }}
              submitLabel="충전하고 후원하기"
            />
            <button className="text-xs text-muted underline" onClick={() => setStep("donate")}>돌아가기</button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{me.nickname}</span>
              <textarea value={message} maxLength={DONATION_MESSAGE_MAX} rows={2} onChange={(e) => setMessage(e.target.value)} placeholder="후원과 함께 채팅을 보내세요"
                className="w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm outline-none placeholder:text-muted focus:border-accent" />
              <span className="self-end text-xs text-muted">{message.length}/{DONATION_MESSAGE_MAX}</span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">후원 금액</span>
                <span className="text-muted">
                  내 꿀 {won(balance)}{" "}
                  <button onClick={reload} aria-label="잔액 새로고침" className="ml-1 hover:text-text">↻</button>
                </span>
              </div>
              <div className="relative">
                <Input inputMode="numeric" value={amount ? won(amount) : ""} invalid={lacking} placeholder="0" className="pr-10"
                  onChange={(e) => setClamped(Number(e.target.value.replace(/\D/g, "")))} />
                <button onClick={() => setClamped(0)} aria-label="금액 지우기" className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-text">✕</button>
              </div>
              {lacking && <p className="text-xs text-danger">{won(short)}꿀이 모자라요</p>}
              {capped && <p className="text-xs text-muted">한 번에 {won(DONATION_MAX)}꿀까지 후원할 수 있어요</p>}
              <div className="flex flex-wrap gap-2">
                {adds.map(([label, n]) => (
                  <button key={label} onClick={() => setClamped(amount + n)} className="h-8 rounded-lg border border-line px-3 text-xs hover:bg-surface-2">{label}</button>
                ))}
                <button onClick={() => setClamped(balance)} className="h-8 rounded-lg border border-line px-3 text-xs hover:bg-surface-2">전액</button>
              </div>
            </div>

            {error && <p className={cx("text-xs text-danger")}>{error}</p>}
            {lacking ? (
              <Button disabled={busy} onClick={startCharge}>충전하고 후원하기</Button>
            ) : (
              <Button loading={busy} disabled={amount < DONATION_MIN} onClick={donate}>{amount >= DONATION_MIN ? `${won(amount)}꿀 후원하기` : "후원하기"}</Button>
            )}
            <p className="text-xs text-muted">
              꿀 충전과 후원 유의사항에 동의합니다{" "}
              <button onClick={() => setNotice(true)} className="underline">안내 보기</button>
            </p>
          </>
        )}
      </div>
      {notice && <NoticeDialog onClose={() => setNotice(false)} />}
    </div>
  );
}
