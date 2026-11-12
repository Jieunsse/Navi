"use client";
import type { ApiRes } from "@nabi/shared";
import { GRADE_LABEL } from "@nabi/shared/grade.ts";
import { settlementApi, statusText } from "@nabi/shared/settlement.ts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { buttonCls } from "@/shared/ui";

type Data = ApiRes<typeof settlementApi.mine>;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const dayFmt = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });
const day = (d: string | Date) => dayFmt.format(new Date(d));

/** 내 방송 관리 맨 위의 정산 카드와 정산 내역(4-12). 조회만 하고 정산 실행 버튼은 없다. */
export function SettlementPanel() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    void apiFetch(settlementApi.mine).then(setData, () => setData(null));
  }, []);
  if (!data) return null;
  const { card, items } = data;
  const acct = card.account ? `${card.account.bank} ****${card.account.last4}${card.account.test ? " (테스트)" : ""}` : "정산 정보 없음 · 쌓아 두는 중";

  return (
    <>
      <section className="flex flex-col gap-4 rounded-lg bg-surface p-4">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-caption-12 text-subtle">{day(card.nearest.date)}에 받을 금액</p>
            <p className="text-heading-20">{won(card.nearest.amount)}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-caption-12 text-subtle">{day(card.following.date)}에 받을 금액(쌓이는 중)</p>
            <p className="text-heading-20">{won(card.following.amount)}</p>
          </div>
          <div className="flex flex-col gap-1 md:items-end">
            <span className="w-fit rounded-full bg-raised px-2 py-0.5 text-badge-12 text-muted">{GRADE_LABEL[card.grade as keyof typeof GRADE_LABEL] ?? card.grade}</span>
            <p className="text-caption-12 text-muted">후원 배분 {card.sharePercent}%</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="flex-1 text-caption-12 text-muted">정산 계좌 · {acct}</p>
          <Link href="/me/grade" className={buttonCls({ variant: "secondary", size: "sm" })}>
            내 등급 보기
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-surface p-4">
        <h2 className="text-heading-16">정산 내역</h2>
        {items.length === 0 ? (
          <p className="py-4 text-center text-caption-12 text-subtle">아직 정산 내역이 없어요</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left">
              <thead className="text-caption-12 text-subtle">
                <tr className="border-b border-line">
                  <th className="py-2 pr-4 font-medium">기간</th>
                  <th className="py-2 pr-4 font-medium">후원 건수</th>
                  <th className="py-2 pr-4 font-medium">방송자 몫</th>
                  <th className="py-2 pr-4 font-medium">상태</th>
                  <th className="py-2 pr-4 font-medium">지급 시각</th>
                  <th className="py-2 font-medium">송금 번호</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b border-line text-body-16">
                    <td className="py-2 pr-4">
                      {day(s.periodStart)} ~ {day(new Date(+new Date(s.periodEnd) - 1))}
                    </td>
                    <td className="py-2 pr-4 text-number-16">{s.donationCount}건</td>
                    <td className="py-2 pr-4 text-number-16">{won(s.streamerShare)}</td>
                    <td className={s.status === "paid" ? "py-2 pr-4 text-success" : "py-2 pr-4"}>
                      {statusText(s.status, s.mock)}
                      {s.mock && s.status !== "paid" && <span className="ml-1 text-caption-12 text-subtle">테스트</span>}
                      {s.holdReason && <span className="block text-caption-12 text-subtle">{s.holdReason}</span>}
                    </td>
                    <td className="py-2 pr-4 text-number-16">{s.paidAt ? formatTime(s.paidAt) : "-"}</td>
                    <td className="py-2 text-number-16">{s.transferId ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
