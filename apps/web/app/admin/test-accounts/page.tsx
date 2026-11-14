"use client";
import type { ApiRes } from "@nabi/shared";
import { GRADE_LABEL, type Grade } from "@nabi/shared/grade.ts";
import { SEED_TARGET_LABEL, seedApi } from "@nabi/shared/seed.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminGate } from "@/features/admin/AdminGate";
import { fail, PageHead } from "@/features/admin/adminUi";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, EmptyState, Notice } from "@/shared/ui";

type Data = ApiRes<typeof seedApi.adminList>;
type Target = keyof typeof SEED_TARGET_LABEL;

const hours = (ms: number) => `${Math.floor(ms / 360_000) / 10}시간`;

function Body() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const load = useCallback(() => apiFetch(seedApi.adminList).then(setData, fail), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, job: () => Promise<{ message: string }>) {
    setBusy(key);
    try {
      toast.success((await job()).message);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
      setConfirming(false);
      await load();
    }
  }
  const partial = (target: Target) => run(target, () => apiFetch(seedApi.adminPartialReset, { target }));
  const full = () => run("all", () => apiFetch(seedApi.adminFullReset));

  return (
    <div className="flex flex-col gap-6">
      <PageHead title="테스트 계정" desc="심사용 계정을 처음 상태로 되돌려요. 앞 심사자가 남긴 기록이 다음 심사자에게 보이기 때문이에요." />

      <section className="flex flex-col gap-4 rounded-lg bg-surface p-8">
        <h2 className="text-heading-16">부분 초기화</h2>
        <p className="text-body-16 text-muted">기록은 지우지 않고 상태만 되돌려요. 꿀을 줄인 기록은 꿀 내역에 &quot;시드 조정&quot; 줄로 남아요.</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SEED_TARGET_LABEL) as Target[]).map((t) => (
            <Button key={t} variant="secondary" loading={busy === t} disabled={!!busy || data?.resetting} onClick={() => partial(t)}>
              {SEED_TARGET_LABEL[t]}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg bg-surface p-8">
        <h2 className="text-heading-16">전체 초기화</h2>
        <p className="text-body-16 text-muted">테스트 계정과 더미 데이터를 모두 지우고 처음부터 다시 만들어요. 수십 초 걸릴 수 있고, 그동안 테스트 계정은 &quot;준비하는 중이에요&quot;가 떠요.</p>
        <p className="text-caption-12 text-muted">미션이 진행 중이거나, 결제 대기·취소 중 충전, 처리 중인 환급, 송금 중인 정산이 있으면 거절해요. 실제 사용자가 걸린 돈 기록과 운영 기록은 지우지 않아요.</p>
        {data?.lastFullResetAt && <p className="text-caption-12 text-muted">마지막 전체 초기화: {formatTime(data.lastFullResetAt)}</p>}
        {data?.nextFullResetAt && <Notice tone="warn">테스트 운영자는 10분에 한 번만 전체 초기화를 할 수 있어요. {formatTime(data.nextFullResetAt)} 이후에 눌러 주세요.</Notice>}
        {data?.resetting && <Notice>지금 초기화하는 중이에요.</Notice>}
        {confirming ? (
          <div className="flex flex-col gap-2">
            <Notice tone="danger">테스트 계정에 심사자가 남긴 충전, 후원, 신고 기록이 모두 사라져요. 계속할까요?</Notice>
            <div className="flex gap-2">
              <Button variant="danger" loading={busy === "all"} onClick={full}>
                전체 초기화 실행
              </Button>
              <Button variant="secondary" disabled={busy === "all"} onClick={() => setConfirming(false)}>
                취소
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button variant="danger" disabled={!!busy || data?.resetting || !!data?.nextFullResetAt} onClick={() => setConfirming(true)}>
              전체 초기화
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-lg bg-surface p-8">
        <h2 className="text-heading-16">계정 현황</h2>
        {data && data.accounts.length === 0 && <EmptyState title="테스트 계정이 아직 없어요" description="서버에서 pnpm seed를 실행하거나 위의 전체 초기화를 눌러 주세요." />}
        <div className="flex flex-col gap-2">
          {data?.accounts.map((a) => (
            <div key={a.uid} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0">
              <div>
                <p className="text-heading-16">
                  {a.nickname} <span className="text-caption-12 text-muted">{a.kind}</span>
                </p>
                <p className="text-caption-12 text-muted">
                  {GRADE_LABEL[a.grade as Grade] ?? a.grade} · 방송 {a.broadcastCount}회 · {hours(a.totalBroadcastMs)} · 받은 후원 {a.donationCount}건
                </p>
              </div>
              <p className="text-body-16">
                꿀 {a.honey.toLocaleString("ko-KR")}
                {a.suspended && " · 영구 정지"}
                {a.chatBannedUntil && " · 채팅 금지"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function AdminTestAccountsPage() {
  return (
    <AdminGate>
      <Body />
    </AdminGate>
  );
}
