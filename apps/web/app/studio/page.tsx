"use client";
import { api, type Broadcast } from "@nabi/shared";
import { recordingApi, recordingStatusLabel, type StudioDonation, type StudioItem } from "@nabi/shared/recording.ts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useRequireLogin } from "@/entities/session/session";
import { SettlementPanel } from "@/features/settlement/SettlementPanel";
import { ChatBansPanel } from "@/features/studio/ChatBansPanel";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatElapsed, formatTime, sourceLabel } from "@/shared/lib/format";
import { Button, buttonCls, ChevronDownIcon, cx, EmptyState, IconButton, PencilIcon, PlusIcon, RadioIcon, Spinner, StatCard, StatusBadge, Switch, Tabs, Trash2Icon } from "@/shared/ui";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const honey = (n: number) => `${n.toLocaleString("ko-KR")}꿀`;
const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");

export default function StudioPage() {
  const { me } = useRequireLogin();
  const [active, setActive] = useState<Broadcast[] | null>(null);
  const [studio, setStudio] = useState<{ ended: StudioItem[]; deletedDonations: StudioDonation[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null); // 후원 목록을 펼친 방송
  const [tab, setTab] = useState<"broadcasts" | "bans">("broadcasts");

  const load = useCallback(
    () =>
      Promise.all([apiFetch(api.myBroadcasts), apiFetch(recordingApi.studio)]).then(([mine, s]) => {
        setActive(mine.items.filter((b) => b.status !== "ended"));
        setStudio(s);
      }),
    [],
  );
  useEffect(() => {
    if (me) void load().catch(fail);
  }, [me, load]);

  if (!me) return null;

  const tabs = <Tabs label="내 방송 관리" value={tab} onChange={setTab} items={[{ value: "broadcasts", label: "방송" }, { value: "bans", label: "활동 제한" }]} />;
  if (tab === "bans")
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:p-8">
        <h1 className="text-heading-28">내 방송 관리</h1>
        {tabs}
        <ChatBansPanel />
      </div>
    );

  async function run(job: () => Promise<unknown>, done: string) {
    try {
      await job();
      toast.success(done);
      void load();
    } catch (e) {
      fail(e);
    }
  }

  async function removeBroadcast(b: Broadcast, status?: string) {
    // 서버도 거절하지만, 눌렀을 때 바로 이유를 말해 준다(4-10).
    if (status === "processing") return void toast.error("다시보기를 만드는 중이에요. 다 된 뒤에 지울 수 있어요");
    if (!confirm(`"${b.title}" 방송을 지울까요? 채팅과 녹화도 함께 지워지고, 되돌릴 수 없어요. 후원 기록은 남아요.`)) return;
    await run(() => apiFetch(api.deleteBroadcast, undefined, { id: b.id }), "방송을 지웠어요");
  }

  async function rename(b: Broadcast) {
    const title = prompt("새 제목을 입력해 주세요", b.title)?.trim();
    if (!title || title === b.title) return;
    await run(() => apiFetch(api.updateBroadcast, { title }, { id: b.id }), "제목을 바꿨어요");
  }

  const ended = studio?.ended ?? [];
  const deleted = studio?.deletedDonations ?? [];
  const totalHoney = ended.reduce((s, i) => s + i.donationTotal, 0) + deleted.reduce((s, d) => s + d.delivered, 0);
  const totalEarning = ended.flatMap((i) => i.donations).concat(deleted).reduce((s, d) => s + d.earning, 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-heading-28">내 방송 관리</h1>
        <Link href="/studio/new" className={buttonCls({ variant: "live" })}>
          <PlusIcon />
          새 방송 만들기
        </Link>
      </div>
      {tabs}

      {studio && (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="전체 후원 합계" value={honey(totalHoney)} />
          <StatCard label="예상 수익" value={won(totalEarning)} tone="success" />
          <StatCard label="방송" value={`${ended.length + (active?.length ?? 0)}개`} />
        </div>
      )}

      <SettlementPanel />

      {!!active?.length && (
        <section className="flex flex-col gap-2">
          <h2 className="text-heading-16">지금 방송</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((b) => (
              <div key={b.id} className="flex flex-col justify-between gap-2 rounded-lg bg-surface p-4">
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.status} />
                  <p className="min-w-0 flex-1 truncate text-heading-16">{b.title}</p>
                  {b.status === "ready" && (
                    <IconButton label="방송 지우기" className="size-8" onClick={() => removeBroadcast(b)}>
                      <Trash2Icon size={16} />
                    </IconButton>
                  )}
                </div>
                <p className="text-caption-12 text-subtle">
                  {b.status === "live" ? `${formatTime(b.startedAt)} 시작` : `${formatTime(b.createdAt)}에 만듦`} · {sourceLabel[b.sourceType]}
                  {b.status === "live" && " · 송출 중인 화면에서 관리해 주세요"}
                </p>
                {b.status === "ready" ? (
                  <div className="flex gap-2">
                    <Link href={`/studio/${b.id}`} className={buttonCls({ variant: "secondary", size: "sm", className: "flex-1" })}>
                      <RadioIcon size={16} />
                      송출 화면 열기
                    </Link>
                    <Button variant="secondary" size="sm" onClick={() => rename(b)}>
                      <PencilIcon size={16} />
                      제목 바꾸기
                    </Button>
                  </div>
                ) : (
                  <Link href={`/live/${b.id}`} target="_blank" className={buttonCls({ variant: "secondary", size: "sm" })}>
                    시청자 화면으로 보기
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        {studio === null ? (
          <Spinner />
        ) : ended.length === 0 ? (
          <EmptyState title="아직 끝난 방송이 없어요" />
        ) : (
          <>
            <div className="hidden gap-4 px-4 text-caption-12 text-subtle md:flex">
              <span className="flex-1">방송</span>
              <span className="w-40">후원 합계</span>
              <span className="w-36">녹화</span>
              <span className="w-64" />
            </div>
            <ul className="flex flex-col gap-2">
              {ended.map((it) => {
                const b = it.broadcast;
                const rec = it.recording;
                const ms = b.startedAt && b.endedAt ? +new Date(b.endedAt) - +new Date(b.startedAt) : null;
                return (
                  <li key={b.id} className="flex flex-col gap-3 rounded-lg bg-surface p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <StatusBadge status="ended" />
                          <Link href={`/live/${b.id}`} className="truncate text-heading-16 hover:underline">{b.title}</Link>
                        </div>
                        <p className="text-caption-12 text-subtle">
                          {formatTime(b.endedAt)} 종료 · {ms === null ? "송출 없음" : formatElapsed(ms)}
                        </p>
                      </div>
                      <div className="flex flex-col md:w-40">
                        <p className="text-number-16">{honey(it.donationTotal)}</p>
                        <p className="text-caption-12 text-subtle">예상 수익 {won(it.donations.reduce((s, d) => s + d.earning, 0))}</p>
                      </div>
                      <div className="flex items-center gap-2 text-body-16 md:w-36">
                        {rec?.status === "processing" && <Spinner className="size-4" />}
                        <span className={cx(rec?.status === "ready" && "text-success", rec?.status === "failed" && "text-danger", rec?.status === "processing" && "text-muted", !rec && "text-subtle")}>
                          {rec ? recordingStatusLabel[rec.status] : "녹화 안 함"}
                        </span>
                        {rec && (rec.status === "ready" || rec.status === "failed") && (
                          <IconButton label="녹화 삭제" className="size-8" onClick={() => confirm("녹화를 지울까요? 되돌릴 수 없어요.") && void run(() => apiFetch(recordingApi.deleteRecording, undefined, { id: rec.id }), "녹화를 지웠어요")}>
                            <Trash2Icon size={16} />
                          </IconButton>
                        )}
                      </div>
                      <div className="flex items-center gap-1 md:w-64 md:justify-end">
                        <Button variant="ghost" size="sm" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? null : b.id)}>
                          <ChevronDownIcon size={16} className={cx(open === b.id && "rotate-180")} />
                          후원 내역
                        </Button>
                        <IconButton label="제목 바꾸기" className="size-8" onClick={() => rename(b)}>
                          <PencilIcon size={16} />
                        </IconButton>
                        <IconButton label="방송 지우기" className="size-8" onClick={() => removeBroadcast(b, rec?.status)}>
                          <Trash2Icon size={16} />
                        </IconButton>
                      </div>
                    </div>

                    {rec?.status === "ready" && (
                      <div className="flex flex-wrap items-center gap-3 rounded-md bg-raised px-3 py-2 text-caption-12">
                        <Switch
                          checked={rec.isPublic}
                          label="녹화 공개"
                          onChange={(isPublic) => void run(() => apiFetch(recordingApi.setRecordingPublic, { isPublic }, { id: rec.id }), isPublic ? "다시보기를 공개했어요" : "다시보기를 비공개로 바꿨어요")}
                        />
                        <span>{rec.isPublic ? "공개" : "비공개"}</span>
                        <Link href={`/replays/${rec.id}`} className="text-heading-16 underline">미리 보기</Link>
                      </div>
                    )}
                    {open === b.id && <DonationTable items={it.donations} />}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {deleted.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-heading-16">지운 방송</h2>
          <DonationTable items={deleted} showTitle />
        </section>
      )}
    </div>
  );
}

function DonationTable({ items, showTitle }: { items: StudioDonation[]; showTitle?: boolean }) {
  if (items.length === 0) return <p className="text-caption-12 text-subtle">받은 후원이 없어요</p>;
  const sum = items.reduce((s, d) => s + d.delivered, 0);
  const earn = items.reduce((s, d) => s + d.earning, 0);
  return (
    <div className="overflow-x-auto rounded-md bg-raised text-body-16">
      <table className="w-full min-w-[32rem] text-left">
        <thead className="text-caption-12 text-subtle">
          <tr>
            {showTitle && <th className="px-3 py-2">방송</th>}
            <th className="px-3 py-2">후원자</th>
            <th className="px-3 py-2">종류</th>
            <th className="px-3 py-2">꿀</th>
            <th className="px-3 py-2">배분 비율</th>
            <th className="px-3 py-2">예상 수익</th>
            <th className="px-3 py-2">시각</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((d) => (
            <tr key={d.id}>
              {showTitle && <td className="px-3 py-2">{d.broadcastTitle}</td>}
              <td className="px-3 py-2">{d.donor}</td>
              <td className="px-3 py-2">{d.kind === "chat" ? "채팅" : d.missionStatus === "success" ? "미션 성공" : "미션 실패(응원금)"}</td>
              <td className="px-3 py-2">{honey(d.delivered)}</td>
              <td className="px-3 py-2">{Math.round(d.shareRate * 100)}%</td>
              <td className="px-3 py-2">{won(d.earning)}</td>
              <td className="px-3 py-2 text-subtle">{formatTime(d.createdAt)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-line text-number-16">
          <tr>
            <td className="px-3 py-2" colSpan={showTitle ? 3 : 2}>합계</td>
            <td className="px-3 py-2">{honey(sum)}</td>
            <td />
            <td className="px-3 py-2">{won(earn)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
