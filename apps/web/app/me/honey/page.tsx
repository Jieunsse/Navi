"use client";
import { honeyApi, type Wallet } from "@nabi/shared/honey.ts";
import { useCallback, useEffect, useState } from "react";
import { useRequireLogin } from "@/entities/session/session";
import { ChargeBox } from "@/features/donation/ChargeBox";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Center } from "@/shared/ui";

const won = (n: number) => n.toLocaleString("ko-KR");
const statusLabel = { pending: "결제 대기", done: "완료", failed: "실패" } as const;
const typeLabel = { charge: "충전", donation: "후원" } as const;

export default function MyHoneyPage() {
  const { me } = useRequireLogin();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const reload = useCallback(async () => setWallet(await apiFetch(honeyApi.wallet).catch(() => null)), []);
  useEffect(() => {
    if (me) void apiFetch(honeyApi.wallet).then(setWallet, () => undefined);
  }, [me]);

  if (!me || !wallet) return <Center><p className="text-muted">불러오는 중…</p></Center>;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
      <section className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-5">
        <span className="text-sm text-muted">내 꿀</span>
        <span className="text-3xl font-black text-accent">{won(wallet.balance)}</span>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">꿀 충전</h2>
        <ChargeBox wallet={wallet} reload={reload} returnTo="/me/honey" />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">충전 내역</h2>
        {wallet.charges.length === 0 && <p className="text-sm text-muted">충전 내역이 없어요</p>}
        {wallet.charges.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
            <span>{won(c.honey)}꿀 <span className="text-muted">({won(c.amount)}원)</span></span>
            <span className="text-xs text-muted">{statusLabel[c.status]} · {formatTime(c.createdAt)}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">꿀 내역</h2>
        {wallet.ledger.length === 0 && <p className="text-sm text-muted">꿀 내역이 없어요</p>}
        {wallet.ledger.map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
            <span>{typeLabel[l.type]}</span>
            <span className="text-xs">
              <b className={l.amount > 0 ? "text-accent" : ""}>{l.amount > 0 ? "+" : ""}{won(l.amount)}</b> <span className="text-muted">· {formatTime(l.createdAt)}</span>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
