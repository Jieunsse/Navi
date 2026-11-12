"use client";
import { api } from "@nabi/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { useBroadcastDoc } from "@/entities/broadcast/model";
import { loginHref, useSession } from "@/entities/session/session";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { DonationSheet } from "@/features/donation/DonationSheet";
import { ReplayButton } from "@/features/replay/ReplayButton";
import { ReportSheet } from "@/features/moderation/ReportSheet";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime, sourceLabel } from "@/shared/lib/format";
import { Center, StatusBadge } from "@/shared/ui";

export default function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const b = useBroadcastDoc(id);
  const [room, setRoom] = useState<Room | null>(null);
  const { me } = useSession();
  const router = useRouter();
  // 로그인하고 돌아오면 후원 창을 바로 연다(4-8).
  const [donateOpen, setDonateOpen] = useState(useSearchParams().get("donate") === "1");
  const [reportOpen, setReportOpen] = useState(false);

  if (b === undefined) return null;
  if (b === null) return <Center><p className="text-muted">방송을 찾을 수 없어요</p></Center>;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 sm:px-4 sm:py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
      {b.status === "ended" ? (
        <div className="grid aspect-video w-full place-items-center bg-surface sm:rounded-xl">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-lg font-semibold">방송이 끝났어요</p>
            <ReplayButton broadcastId={id} />
            <Link href="/" className="text-sm text-accent underline">다른 방송 보기</Link>
          </div>
        </div>
      ) : (
        <Player id={id} live={b.status === "live"} onRoom={setRoom} />
      )}
      <div className="flex flex-col gap-1 px-4 sm:px-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={b.status} />
          <h1 className="truncate text-lg font-bold">{b.title}</h1>
        </div>
        <p className="text-sm text-muted">
          {b.ownerNickname} · {sourceLabel[b.sourceType]}
          {b.startedAt && ` · ${formatTime(b.startedAt)} 시작`}
          {b.donationTotal > 0 && ` · 후원 ${b.donationTotal.toLocaleString()}꿀`}
        </p>
        {me?.uid !== b.ownerId && (
          <button onClick={() => (me ? setReportOpen(true) : router.push(loginHref(`/live/${id}`)))} className="w-fit text-xs text-muted underline hover:text-text">
            방송 신고
          </button>
        )}
        {b.status !== "ended" &&
          (me?.uid === b.ownerId ? (
            <button disabled title="내 방송에는 후원할 수 없어요" className="mt-2 h-10 w-fit cursor-not-allowed rounded-lg bg-surface-2 px-4 text-sm font-semibold opacity-40">
              🍯 후원하기
            </button>
          ) : (
            <button
              onClick={() => (me ? setDonateOpen(true) : router.push(loginHref(`/live/${id}?donate=1`)))}
              className="mt-2 h-10 w-fit rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink"
            >
              🍯 후원하기
            </button>
          ))}
      </div>
      {reportOpen && <ReportSheet target={{ targetType: "broadcast", targetId: id }} label={`방송 “${b.title}”을 신고해요`} onClose={() => setReportOpen(false)} />}
      {donateOpen && me && me.uid !== b.ownerId && <DonationSheet broadcastId={id} ownerId={b.ownerId} status={b.status} onClose={() => setDonateOpen(false)} />}
      </div>
      <div className="h-[60vh] min-h-[360px] lg:h-[calc(100vh-7rem)]">
        <ChatPanel broadcastId={id} ownerId={b.ownerId} status={b.status} room={b.status === "ended" ? null : room} />
      </div>
    </div>
  );
}

/** 시청 전용 연결. 영상과 소리를 한 <video>에 모아 소리를 끈 채 자동 재생한다(아이폰 자동 재생 규칙, 4-6). */
function Player({ id, live, onRoom }: { id: string; live: boolean; onRoom: (r: Room | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const room = new Room({ adaptiveStream: true });
    let cancelled = false;
    const rebuild = () => {
      const host = [...room.remoteParticipants.values()].find((p) => p.identity.startsWith("host_"));
      const pubs = host ? [...host.trackPublications.values()].filter((p) => p.track) : [];
      const main = pubs.find((p) => p.source === Track.Source.ScreenShare) ?? pubs.find((p) => p.source === Track.Source.Camera);
      const audio = pubs.filter((p) => p.kind === Track.Kind.Audio);
      const el = videoRef.current;
      setHasVideo(!!main);
      if (!el) return;
      el.srcObject = main ? new MediaStream([main.track!.mediaStreamTrack, ...audio.map((a) => a.track!.mediaStreamTrack)]) : null;
      if (main) void el.play().catch(() => undefined);
    };
    room
      .on(RoomEvent.TrackSubscribed, rebuild)
      .on(RoomEvent.TrackUnsubscribed, rebuild)
      .on(RoomEvent.TrackMuted, rebuild)
      .on(RoomEvent.TrackUnmuted, rebuild)
      .on(RoomEvent.ParticipantDisconnected, rebuild);
    apiFetch(api.viewerToken, undefined, { id })
      .then(({ token, url }) => (cancelled ? undefined : room.connect(url, token)))
      .then(() => {
        rebuild();
        if (!cancelled) onRoom(room);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      onRoom(null);
      void room.disconnect();
    };
  }, [id, onRoom]);

  function unmute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    void el.play();
    setMuted(false);
  }

  return (
    <div className="relative grid aspect-video w-full place-items-center overflow-hidden bg-black sm:rounded-xl">
      <video ref={videoRef} autoPlay muted playsInline className={`size-full object-contain ${hasVideo ? "" : "invisible"}`} />
      {!hasVideo && (
        <p className="absolute text-sm text-muted">{error || (live ? "방송자 연결을 기다리는 중이에요" : "곧 방송이 시작돼요")}</p>
      )}
      {hasVideo && muted && (
        <button onClick={unmute} className="absolute rounded-full bg-black/70 px-6 py-4 text-base font-semibold backdrop-blur hover:bg-black/80">
          🔇 눌러서 소리 켜기
        </button>
      )}
    </div>
  );
}
