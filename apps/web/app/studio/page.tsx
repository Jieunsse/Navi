"use client";
import { api, type Broadcast } from "@nabi/shared";
import { recordingApi, recordingStatusLabel, type StudioDonation, type StudioItem } from "@nabi/shared/recording.ts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useRequireLogin } from "@/entities/session/session";
import { Toggle } from "@/features/studio/Toggle";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatElapsed, formatTime, sourceLabel } from "@/shared/lib/format";
import { Button, StatusBadge } from "@/shared/ui";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const honey = (n: number) => `${n.toLocaleString("ko-KR")}꿀`;
const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
const linkBtn = "inline-flex h-9 items-center rounded-lg bg-surface-2 px-3 text-sm font-semibold";

export default function StudioPage() {
  const { me } = useRequireLogin();
  const [active, setActive] = useState<Broadcast[] | null>(null);
  const [studio, setStudio] = useState<{ ended: StudioItem[]; deletedDonations: StudioDonation[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null); // 후원 목록을 펼친 방송

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">내 방송 관리</h1>
        <Link href="/studio/new" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">
          방송 만들기
        </Link>
      </div>

      {active?.map((b) => (
        <section key={b.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-accent/40 bg-accent/5 p-4">
          <StatusBadge status={b.status} />
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate font-semibold">{b.title}</p>
            <p className="text-xs text-muted">
              {sourceLabel[b.sourceType]} · {b.status === "live" ? `${formatTime(b.startedAt)} 시작` : `${formatTime(b.createdAt)} 만듦`}
            </p>
            {b.status === "live" && <p className="mt-1 text-xs text-muted">송출 중인 화면에서 관리해 주세요</p>}
          </div>
          {b.status === "ready" ? (
            <>
              <Link href={`/studio/${b.id}`} className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink">
                송출 화면 열기
              </Link>
              <Button variant="ghost" onClick={() => rename(b)}>제목 바꾸기</Button>
              <Button variant="ghost" onClick={() => removeBroadcast(b)}>지우기</Button>
            </>
          ) : (
            <Link href={`/live/${b.id}`} target="_blank" className={linkBtn}>
              시청자 화면으로 보기
            </Link>
          )}
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">끝난 방송</h2>
          {studio && <p className="text-xs text-muted">전체 후원 {honey(totalHoney)} · 예상 수익 {won(totalEarning)}</p>}
        </div>
        {studio === null ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : ended.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">아직 끝난 방송이 없어요</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {ended.map((it) => {
              const b = it.broadcast;
              const rec = it.recording;
              const ms = b.startedAt && b.endedAt ? +new Date(b.endedAt) - +new Date(b.startedAt) : null;
              return (
                <li key={b.id} className="flex flex-col gap-3 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1 basis-48">
                      <Link href={`/live/${b.id}`} className="block truncate font-medium hover:text-accent">{b.title}</Link>
                      <p className="text-xs text-muted">
                        {formatTime(b.endedAt)} 종료 · {ms === null ? "송출 없음" : formatElapsed(ms)} · 후원 {honey(it.donationTotal)}
                        {rec && ` · 녹화 ${recordingStatusLabel[rec.status]}${rec.status === "ready" ? (rec.isPublic ? ", 공개" : ", 비공개") : ""}`}
                      </p>
                    </div>
                    <Button variant="ghost" onClick={() => rename(b)}>제목 바꾸기</Button>
                    <Button variant="ghost" onClick={() => removeBroadcast(b, rec?.status)}>지우기</Button>
                  </div>

                  {rec && (rec.status === "ready" || rec.status === "failed") && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      {rec.status === "ready" && (
                        <>
                          <Toggle
                            checked={rec.isPublic}
                            label="녹화 공개"
                            onChange={(isPublic) => void run(() => apiFetch(recordingApi.setRecordingPublic, { isPublic }, { id: rec.id }), isPublic ? "다시보기를 공개했어요" : "다시보기를 비공개로 바꿨어요")}
                          />
                          <span>{rec.isPublic ? "공개" : "비공개"}</span>
                          <Link href={`/replays/${rec.id}`} className="font-semibold text-accent underline">미리 보기</Link>
                        </>
                      )}
                      {rec.status === "failed" && <span className="text-muted">녹화를 만들지 못했어요</span>}
                      <Button variant="ghost" className="ml-auto h-8" onClick={() => confirm("녹화를 지울까요? 되돌릴 수 없어요.") && void run(() => apiFetch(recordingApi.deleteRecording, undefined, { id: rec.id }), "녹화를 지웠어요")}>
                        녹화 삭제
                      </Button>
                    </div>
                  )}
                  {rec?.status === "processing" && <p className="text-xs text-muted">다시보기를 만드는 중이에요. 다 되면 여기서 공개할 수 있어요</p>}

                  <button className="w-fit text-xs text-muted underline" onClick={() => setOpen(open === b.id ? null : b.id)}>
                    {open === b.id ? "후원 내역 닫기" : `후원 내역 보기 (${it.donations.length}건)`}
                  </button>
                  {open === b.id && <DonationTable items={it.donations} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {deleted.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">지운 방송</h2>
          <p className="text-xs text-muted">방송을 지워도 후원 기록은 남아요. 위쪽 전체 후원과 예상 수익에도 들어가요.</p>
          <DonationTable items={deleted} showTitle />
        </section>
      )}
    </div>
  );
}

function DonationTable({ items, showTitle }: { items: StudioDonation[]; showTitle?: boolean }) {
  if (items.length === 0) return <p className="text-xs text-muted">받은 후원이 없어요</p>;
  const sum = items.reduce((s, d) => s + d.delivered, 0);
  const earn = items.reduce((s, d) => s + d.earning, 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-line text-sm">
      <table className="w-full min-w-[32rem] text-left">
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>
            {showTitle && <th className="px-3 py-2 font-medium">방송</th>}
            <th className="px-3 py-2 font-medium">후원자</th>
            <th className="px-3 py-2 font-medium">꿀</th>
            <th className="px-3 py-2 font-medium">배분 비율</th>
            <th className="px-3 py-2 font-medium">예상 수익</th>
            <th className="px-3 py-2 font-medium">시각</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((d) => (
            <tr key={d.id}>
              {showTitle && <td className="px-3 py-2">{d.broadcastTitle}</td>}
              <td className="px-3 py-2">{d.donor}</td>
              <td className="px-3 py-2">{honey(d.delivered)}</td>
              <td className="px-3 py-2">{Math.round(d.shareRate * 100)}%</td>
              <td className="px-3 py-2">{won(d.earning)}</td>
              <td className="px-3 py-2 text-muted">{formatTime(d.createdAt)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-surface-2 font-medium">
          <tr>
            <td className="px-3 py-2" colSpan={showTitle ? 2 : 1}>합계</td>
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
