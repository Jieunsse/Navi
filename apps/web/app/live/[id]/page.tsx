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
import { Avatar, Button, buttonCls, EmptyState, EllipsisIcon, GiftIcon, IconButton, Spinner, StatusBadge, Volume2Icon } from "@/shared/ui";

export default function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const b = useBroadcastDoc(id);
  const [room, setRoom] = useState<Room | null>(null);
  const { me } = useSession();
  const router = useRouter();
  // 로그인하고 돌아오면 후원 창을 바로 연다(4-8).
  const [donateOpen, setDonateOpen] = useState(useSearchParams().get("donate") === "1");
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (b === undefined) return null;
  if (b === null) return <EmptyState title="방송을 찾을 수 없어요" action={<Link href="/" className={buttonCls({ variant: "secondary" })}>홈으로</Link>} />;

  const own = me?.uid === b.ownerId;
  const donate = () => (me ? setDonateOpen(true) : router.push(loginHref(`/live/${id}?donate=1`)));

  return (
    <div className="flex flex-1 flex-col lg:h-[calc(100dvh-var(--size-header))] lg:flex-row lg:overflow-hidden">
      <div className="flex min-w-0 flex-col gap-4 pb-4 lg:flex-1 lg:overflow-y-auto lg:p-6">
        {b.status === "ended" ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-screen text-center lg:rounded-md">
            <p className="text-heading-20 text-on-video">방송이 끝났어요</p>
            <div className="flex gap-2">
              <ReplayButton broadcastId={id} />
              <Link href="/" className={buttonCls({ variant: "secondary", size: "lg" })}>다른 방송 보기</Link>
            </div>
          </div>
        ) : (
          <Player id={id} live={b.status === "live"} onRoom={setRoom} />
        )}
        <div className="flex flex-col gap-2 px-4 lg:p-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={b.status} />
            <h1 className="min-w-0 flex-1 truncate text-heading-16 lg:text-heading-20">{b.title}</h1>
            {!own && (
              <div className="relative">
                <IconButton label="더보기" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
                  <EllipsisIcon size={20} />
                </IconButton>
                {menuOpen && (
                  <div className="absolute right-0 top-full z-[var(--z-dropdown)] mt-1 w-40 rounded-md border border-line bg-raised p-1 shadow-float">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        if (me) setReportOpen(true);
                        else router.push(loginHref(`/live/${id}`));
                      }}
                      className="flex h-10 w-full items-center rounded-sm px-3 text-left text-body-16 hover:bg-hover"
                    >
                      방송 신고
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Avatar name={b.ownerNickname} size="sm" live={b.status === "live"} />
            <span className="text-heading-16">{b.ownerNickname}</span>
            <span className="min-w-0 flex-1 truncate text-caption-12 text-muted">
              {sourceLabel[b.sourceType]}
              {b.startedAt && ` · ${formatTime(b.startedAt)} 시작`}
              {b.donationTotal > 0 && ` · 후원 ${b.donationTotal.toLocaleString()}꿀`}
            </span>
            {b.status !== "ended" && (
              <Button variant="live" className="max-lg:hidden" disabled={own} title={own ? "내 방송에는 후원할 수 없어요" : undefined} onClick={donate}>
                <GiftIcon size={20} />
                후원하기
              </Button>
            )}
          </div>
        </div>
        {reportOpen && <ReportSheet target={{ targetType: "broadcast", targetId: id }} label={`방송 “${b.title}”을 신고해요`} onClose={() => setReportOpen(false)} />}
        {donateOpen && me && !own && <DonationSheet broadcastId={id} ownerId={b.ownerId} status={b.status} onClose={() => setDonateOpen(false)} />}
      </div>
      <div className="h-[60vh] min-h-80 border-t border-line lg:h-auto lg:w-[360px] lg:shrink-0 lg:border-l lg:border-t-0">
        <ChatPanel
          broadcastId={id}
          ownerId={b.ownerId}
          status={b.status}
          room={b.status === "ended" ? null : room}
          donationTotal={b.donationTotal}
          onDonate={b.status === "ended" ? undefined : donate}
          donateBlockedReason={own ? "내 방송에는 후원할 수 없어요" : undefined}
        />
      </div>
    </div>
  );
}

/** 시청 전용 연결. 영상과 소리를 한 <video>에 모아 소리를 끈 채 자동 재생한다(아이폰 자동 재생 규칙, 4-6). */
function Player({ id, live, onRoom }: { id: string; live: boolean; onRoom: (r: Room | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [hasCam, setHasCam] = useState(false);
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
      // 화면 공유와 함께 온 카메라 영상만 작은 창에 보여준다. 카메라만 보내는 방송은 카메라가 큰 화면이다(결정 15).
      const cam = main?.source === Track.Source.ScreenShare ? pubs.find((p) => p.source === Track.Source.Camera && !p.isMuted) : undefined;
      if (camRef.current) camRef.current.srcObject = cam ? new MediaStream([cam.track!.mediaStreamTrack]) : null;
      setHasCam(!!cam);
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
    <div className="relative grid aspect-video w-full place-items-center overflow-hidden bg-screen lg:rounded-md">
      <video ref={videoRef} autoPlay muted playsInline className={`size-full object-contain ${hasVideo ? "" : "invisible"}`} />
      <video ref={camRef} autoPlay muted playsInline className={`absolute bottom-3 right-3 aspect-video w-1/5 min-w-24 rounded-sm border border-line bg-screen object-cover ${hasCam ? "" : "hidden"}`} />
      {!hasVideo && (
        <div className="absolute flex flex-col items-center gap-3 text-body-16 text-subtle">
          {!error && <Spinner />}
          <p>{error || (live ? "방송자 연결을 기다리는 중이에요" : "곧 방송이 시작돼요")}</p>
        </div>
      )}
      {hasVideo && muted && (
        <button onClick={unmute} className="absolute inline-flex h-12 items-center gap-2 rounded-full bg-overlay px-6 text-heading-16 text-on-video">
          <Volume2Icon size={20} />
          눌러서 소리 켜기
        </button>
      )}
    </div>
  );
}
