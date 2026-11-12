"use client";
import { DONATION_MAX, DONATION_MIN } from "@nabi/shared/honey.ts";
import { useState } from "react";
import { cx, HelpTip, IconButton, XIcon } from "@/shared/ui";

const won = (n: number) => n.toLocaleString("ko-KR");
const adds = [["+1천", 1_000], ["+1만", 10_000], ["+10만", 100_000], ["+100만", 1_000_000]] as const;
const chip = "h-8 rounded-full border border-line bg-raised px-3 text-caption-12 text-muted hover:bg-hover";

/** 금액 칸: 직접 입력, 더하기 버튼, 전액, 잔액 부족 안내. 채팅 후원과 미션 상금이 함께 쓴다(4-8). */
export function AmountField({ title, help, amount, onChange, balance, onReload }: { title: string; help?: string; amount: number; onChange: (n: number) => void; balance: number; onReload: () => void }) {
  const [capped, setCapped] = useState(false);
  const short = Math.max(0, amount - balance);
  const lacking = amount >= DONATION_MIN && short > 0;
  const set = (n: number) => {
    setCapped(n > DONATION_MAX);
    onChange(Math.min(n, DONATION_MAX));
  };
  return (
    <div className="flex flex-col gap-3 rounded-md bg-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-heading-16">
          {title}
          {help && <HelpTip text={help} label="상금 안내" />}
        </span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-caption-12">
            <span className="text-muted">내 꿀</span>
            <span className="text-number-12 text-live-ink">{won(balance)}</span>
          </span>
          <button type="button" onClick={onReload} aria-label="잔액 새로고침" className="grid size-7 place-items-center rounded-full border border-line text-muted hover:text-text">
            ↻
          </button>
        </span>
      </div>
      <div className={cx("flex h-12 items-center gap-2 rounded-sm border bg-base pl-4 pr-2", lacking ? "border-danger" : "border-line focus-within:border-[var(--color-focus-ring)]")}>
        <input
          inputMode="numeric"
          aria-label={title}
          aria-invalid={lacking || undefined}
          value={amount ? won(amount) : ""}
          placeholder="0"
          className={cx("min-w-0 flex-1 bg-transparent text-heading-20 outline-none placeholder:text-subtle", lacking ? "text-danger" : "text-live-ink")}
          onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))}
        />
        <span className="text-body-16 text-muted">꿀</span>
        <IconButton label="금액 지우기" onClick={() => set(0)} className="size-8">
          <XIcon size={16} />
        </IconButton>
      </div>
      {lacking && <p className="text-caption-12 text-danger">{won(short)}꿀이 모자라요</p>}
      {capped && <p className="text-caption-12 text-subtle">한 번에 {won(DONATION_MAX)}꿀까지 후원할 수 있어요</p>}
      <div className="flex flex-wrap gap-2">
        {adds.map(([label, n]) => (
          <button key={label} type="button" onClick={() => set(amount + n)} className={chip}>{label}</button>
        ))}
        <button type="button" onClick={() => set(balance)} className={chip}>전액</button>
      </div>
    </div>
  );
}
