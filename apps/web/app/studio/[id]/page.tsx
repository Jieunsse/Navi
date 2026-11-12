"use client";
import { api, START_TIMEOUT_MS, TEST_ACCOUNTS, TEST_BROADCAST_LIMIT_MS, TEST_BROADCAST_WARN_MS, TITLE_MAX } from "@nabi/shared";
import { RECORDING_MAX_MS, recordingApi } from "@nabi/shared/recording.ts";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { ConnectionQuality, Room, RoomEvent, Track, type Participant } from "livekit-client";
import { toast } from "sonner";
import { useBroadcastDoc } from "@/entities/broadcast/model";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { useRequireLogin } from "@/entities/session/session";
import { MissionList } from "@/features/donation/MissionList";
import { AudioMeter } from "@/features/studio/AudioMeter";
import { RecordSwitch } from "@/features/studio/RecordSwitch";
import { Stepper } from "@/features/studio/Stepper";
import { useRecordingState } from "@/features/studio/useRecordingState";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatElapsed } from "@/shared/lib/format";
import { Button, buttonCls, CircleAlertIcon, CircleCheckIcon, cx, CopyIcon, Dialog, EmptyState, IconButton, Input, LinkIcon, Notice, MicIcon, MicOffIcon, PencilIcon, RadioIcon, Spinner, StatusBadge, SwitchCameraIcon, VideoIcon } from "@/shared/ui";

type Phase = "setup" | "starting" | "live" | "ended";
type Quality = "good" | "unstable" | "reconnecting";

const UNSTABLE_WARN_MS = 10_000; // 임시값(4-4)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stop = (...tracks: (MediaStreamTrack | null)[]) => tracks.forEach((t) => t?.stop());

export default function StudioBroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useRequireLogin();
  const b = useBroadcastDoc(id);
  // 처음 열었을 때의 상태로 화면을 고른다. 이 탭에서 시작한 방송이 "방송 중"이 돼도 막히지 않게 하기 위해서다.
  const [firstStatus, setFirstStatus] = useState<string | null>(null);
  if (b && firstStatus === null) setFirstStatus(b.status);

  if (!me || b === undefined) return null;
  if (b === null) return <EmptyState title="방송을 찾을 수 없어요" action={<Link href="/studio" className={buttonCls({ variant: "secondary" })}>내 방송 관리</Link>} />;
  if (b.ownerId !== me.uid) return <EmptyState title="이 방송의 송출 화면은 방송자만 열 수 있어요" action={<Link href="/" className={buttonCls({ variant: "secondary" })}>홈으로</Link>} />;
  if (firstStatus === "live")
    return (
      <EmptyState
        title="이미 방송 중인 방송이에요"
        description="송출 화면에는 다시 들어갈 수 없어요. 방송을 켠 탭에서 이어서 해 주세요."
        action={<Link href={`/live/${id}`} className={buttonCls({ variant: "secondary" })}>시청자 화면으로 보기</Link>}
      />
    );
  if (firstStatus === "ended") return <Ended id={id} />;
  return <Publisher id={id} ownerId={b.ownerId} title={b.title} sourceType={b.sourceType} withCamera={b.withCamera} status={b.status} startedAt={b.startedAt} donationTotal={b.donationTotal} isTestBroadcaster={me.uid === TEST_ACCOUNTS.broadcaster} />;
}

function Ended({ id, recording }: { id: string; recording?: boolean }) {
  return (
    <EmptyState
      title="방송이 끝났어요"
      description={recording ? "다시보기를 만드는 중이에요. 다 되면 내 방송 관리에서 공개할 수 있어요" : "시청자에게도 끝났다고 보여요"}
      action={
        <div className="flex flex-col items-center gap-3">
          {recording && <Spinner />}
          <div className="flex gap-2">
            <Link href="/studio" className={buttonCls({ variant: "secondary" })}>내 방송 관리</Link>
            <Link href="/studio/new" className={buttonCls()}>새 방송 만들기</Link>
          </div>
          <Link href={`/live/${id}`} className="text-caption-12 text-muted underline">방송 화면 보기</Link>
        </div>
      }
    />
  );
}

function Publisher(props: { id: string; ownerId: string; title: string; sourceType: "screen" | "camera"; withCamera: boolean; status: string; startedAt: Date | null; donationTotal: number; isTestBroadcaster: boolean }) {
  const { id, ownerId, sourceType, withCamera, status, startedAt, isTestBroadcaster } = props;
  const isScreen = sourceType === "screen";
  const [phase, setPhase] = useState<Phase>("setup");
  const [video, setVideo] = useState<MediaStreamTrack | null>(null);
  const [tabAudio, setTabAudio] = useState<MediaStreamTrack | null>(null);
  const [mic, setMic] = useState<MediaStreamTrack | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cam, setCam] = useState<MediaStreamTrack | null>(null); // 화면과 함께 보내는 얼굴 카메라(결정 15)
  const [camFailed, setCamFailed] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [mediaError, setMediaError] = useState("");
  const [startError, setStartError] = useState("");
  const [quality, setQuality] = useState<Quality>("good");
  const [unstableSince, setUnstableSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [title, setTitle] = useState(props.title);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [tab, setTab] = useState<"chat" | "mission">("chat");
  const [record, setRecord] = useState(false); // 방송 시작 전에만 고른다(4-4의 5번)
  const rec = useRecordingState(id);
  const [liveRoom, setLiveRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const endingRef = useRef(false);
  const warnedRef = useRef(false);
  const preview = useRef<HTMLVideoElement>(null);
  const camPreview = useRef<HTMLVideoElement>(null);
  const tracks = useRef({ video, tabAudio, mic, cam });
  useEffect(() => {
    tracks.current = { video, tabAudio, mic, cam };
  }, [video, tabAudio, mic, cam]);
  const linkOf = () => `${location.origin}/live/${id}`;

  useEffect(() => {
    if (preview.current) preview.current.srcObject = video ? new MediaStream([video]) : null;
  }, [video]);
  useEffect(() => {
    if (camPreview.current) camPreview.current.srcObject = cam ? new MediaStream([cam]) : null;
  }, [cam]);

  useEffect(() => () => {
    const t = tracks.current;
    stop(t.video, t.tabAudio, t.mic, t.cam);
    void roomRef.current?.disconnect();
  }, []);

  /** 어떤 길로 끝나든 이 함수 하나로 화면을 정리한다. 서버 종료는 한 번만 요청한다. */
  const finish = useCallback(async (askServer: boolean) => {
    if (endingRef.current) return;
    endingRef.current = true;
    if (askServer) await apiFetch(api.endBroadcast, undefined, { id }).catch(() => undefined);
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setLiveRoom(null);
    const t = tracks.current;
    stop(t.video, t.tabAudio, t.mic, t.cam);
    setPhase("ended");
  }, [id]);

  // 서버가 끝냈으면(웹훅, 운영자, 30분 제한) 화면도 끝낸다.
  useEffect(() => {
    if (status === "ended" && phase === "live") void finish(false);
  }, [status, phase, finish]);

  // 크롬의 "공유 중지"를 누르면 영상 트랙이 끝난다(07 3장).
  useEffect(() => {
    if (!video || phase !== "live") return;
    const onEnded = () => void finish(true);
    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [video, phase, finish]);

  // 방송 중: 시계, 떠나기 경고, 화면 켜 두기, 휴대폰에서 돌아왔을 때 상태 확인
  useEffect(() => {
    if (phase !== "live") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", beforeUnload);
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
    const requestLock = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    void requestLock();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void requestLock();
      // LiveKit이 다시 붙지 못했으면 종료한다(결정 30). 다시 붙는 중이면 기다린다.
      if (roomRef.current?.state === "disconnected") void finish(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [phase, finish]);

  const elapsed = startedAt ? now - startedAt.getTime() : 0;

  // 테스트 방송자는 30분까지(4-18)
  useEffect(() => {
    if (!isTestBroadcaster || phase !== "live" || !startedAt) return;
    if (elapsed >= TEST_BROADCAST_LIMIT_MS) void finish(true);
    else if (elapsed >= TEST_BROADCAST_WARN_MS && !warnedRef.current) {
      warnedRef.current = true;
      toast.warning("5분 뒤에 방송이 끝나요", { duration: 10_000 });
    }
  }, [elapsed, isTestBroadcaster, phase, startedAt, finish]);

  // 녹화 시작 3분 뒤에 서버에 "녹화 멈춤"을 요청한다. 방송은 계속된다(4-9). 서버도 따로 확인하므로 실패해도 괜찮다.
  const recStartedMs = rec.startedAt?.getTime() ?? null;
  useEffect(() => {
    if (phase !== "live" || recStartedMs === null) return;
    const t = setTimeout(() => void apiFetch(recordingApi.stopRecording, undefined, { id }).catch(() => undefined), Math.max(0, recStartedMs + RECORDING_MAX_MS - Date.now()));
    return () => clearTimeout(t);
  }, [phase, recStartedMs, id]);

  async function requestMic() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const track = s.getAudioTracks()[0]!;
      setMic(track);
      setMicDenied(false);
      setMicMuted(false);
      return track;
    } catch {
      setMicDenied(true);
      return null;
    }
  }

  async function shareScreen() {
    setMediaError("");
    setStartError("");
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
        selfBrowserSurface: "exclude",
        systemAudio: "include",
      } as DisplayMediaStreamOptions);
    } catch {
      setMediaError("화면 공유를 허용하지 않았어요. 화면 공유 없이는 방송을 시작할 수 없어요. \"화면 공유 시작\"을 다시 누르고 공유할 탭을 골라 주세요.");
      return;
    }
    stop(video, tabAudio);
    setVideo(s.getVideoTracks()[0] ?? null);
    setTabAudio(s.getAudioTracks()[0] ?? null);
    if (!mic) await requestMic();
    if (withCamera && !cam) await requestCam();
  }

  /** 얼굴 카메라. 거부하거나 카메라가 없어도 화면만으로 방송을 시작할 수 있다(4-4). */
  async function requestCam() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } } });
      setCam(s.getVideoTracks()[0] ?? null);
      setCamFailed(false);
    } catch {
      setCamFailed(true);
    }
  }

  async function openCamera(face = facing) {
    setMediaError("");
    setStartError("");
    setAsking(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 } } });
      const next = s.getVideoTracks()[0]!;
      // 방송 중에 카메라를 바꾸면 올린 트랙만 갈아 끼운다.
      const pub = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
      if (pub?.track) await pub.track.replaceTrack(next);
      stop(video);
      setVideo(next);
      setFacing(face);
    } catch {
      setMediaError("카메라를 켜지 못했어요. 아이폰은 설정 앱 > 사파리(또는 크롬) > 카메라에서 허용으로 바꾼 뒤 다시 시도해 주세요.");
      return;
    }
    if (!mic) await requestMic();
  }

  async function start() {
    if (!video) return;
    setStartError("");
    setPhase("starting");
    endingRef.current = false;
    const room = new Room({ dynacast: true });
    roomRef.current = room;
    room.on(RoomEvent.ConnectionQualityChanged, (q: ConnectionQuality, p: Participant) => {
      if (p !== room.localParticipant) return;
      const bad = q === ConnectionQuality.Poor || q === ConnectionQuality.Lost;
      setQuality(bad ? "unstable" : "good");
      setUnstableSince((s) => (bad ? (s ?? Date.now()) : null));
    });
    room.on(RoomEvent.Reconnecting, () => setQuality("reconnecting"));
    room.on(RoomEvent.Reconnected, () => setQuality("good"));
    try {
      await apiFetch(api.updateBroadcast, { title: title.trim() || props.title }, { id }).catch(() => undefined);
      const { token, url } = await apiFetch(api.publishToken, { recordingEnabled: record }, { id });
      await room.connect(url, token);
      const lp = room.localParticipant;
      await lp.publishTrack(video, { source: isScreen ? Track.Source.ScreenShare : Track.Source.Camera, simulcast: true });
      if (tabAudio) await lp.publishTrack(tabAudio, { source: Track.Source.ScreenShareAudio });
      if (mic) await lp.publishTrack(mic, { source: Track.Source.Microphone });
      if (cam) await lp.publishTrack(cam, { source: Track.Source.Camera, simulcast: true });
      const deadline = Date.now() + START_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const { status } = await apiFetch(api.confirmLive, undefined, { id });
        if (status === "live") {
          room.on(RoomEvent.Disconnected, () => void finish(true));
          setLiveRoom(room);
          setPhase("live");
          return;
        }
        if (status === "ended") throw new ApiError(409, "ENDED", "이미 끝난 방송이에요");
        await sleep(1500);
      }
      throw new Error("timeout");
    } catch (e) {
      // 연결을 끊어야 늦게 올라온 송출 때문에 방송이 켜지지 않는다(결정 30). 미리보기 트랙은 남긴다.
      await room.disconnect(false);
      roomRef.current = null;
      setStartError(e instanceof ApiError && e.status !== 0 ? e.message : "방송을 시작하지 못했어요. 다시 시도해 주세요");
      setPhase("setup");
    }
  }

  async function toggleMic() {
    const pub = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (!mic && phase === "live") {
      const t = await requestMic();
      if (t) await roomRef.current?.localParticipant.publishTrack(t, { source: Track.Source.Microphone });
      return;
    }
    if (!pub?.track) return;
    if (micMuted) await pub.track.unmute();
    else await pub.track.mute();
    setMicMuted(!micMuted);
  }

  async function toggleCam() {
    const pub = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
    if (!pub?.track) return;
    if (camOff) await pub.track.unmute();
    else await pub.track.mute();
    setCamOff(!camOff);
  }

  async function saveTitle() {
    try {
      await apiFetch(api.updateBroadcast, { title: title.trim() }, { id });
      setEditing(false);
      toast.success("제목을 바꿨어요");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
    }
  }

  const copyLink = () => navigator.clipboard.writeText(linkOf()).then(() => toast.success("링크를 복사했어요"), () => toast.error(linkOf()));

  if (phase === "ended") return <Ended id={id} recording={record && !rec.failReason} />;

  const micOff = micDenied || micMuted || !mic;
  const qualityLabel = { good: "좋음", unstable: "불안정", reconnecting: "다시 연결 중" }[quality];
  const showUnstable = phase === "live" && quality !== "good" && unstableSince !== null && now - unstableSince > UNSTABLE_WARN_MS;

  const live = phase === "live";
  const step = !video ? 1 : phase === "starting" ? 3 : 2;
  const checks: [boolean, string][] = [
    [!!video, "화면이 보여요"],
    ...(isScreen ? ([[!!tabAudio, "화면 소리가 들려요"]] as [boolean, string][]) : []),
    [!micOff, "마이크 소리가 들려요"],
  ];

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-3 lg:h-[calc(100dvh-var(--size-header))] lg:flex-row lg:gap-0 lg:overflow-hidden lg:p-0">
      <div className="max-lg:contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:p-6">
        {!live && <Stepper current={step} />}
        {live && micOff && <Notice tone="danger">마이크가 꺼져 있어요. 시청자에게 내 목소리가 들리지 않아요</Notice>}
        {showUnstable && (
          <Notice tone="warn">
            {isScreen
              ? "인터넷이 불안정해서 시청자 화면이 끊길 수 있어요. 다른 탭의 동영상이나 내려받기를 멈춰 보세요"
              : "인터넷이 불안정해서 시청자 화면이 끊길 수 있어요. 와이파이가 잘 잡히는 곳으로 옮겨 보세요"}
          </Notice>
        )}
        {live && !isScreen && <Notice tone="warn">화면을 켜 둔 채로 두세요. 다른 앱으로 가면 방송이 끝나요</Notice>}
        {live && record && rec.failReason === "quota" && <Notice tone="warn">이번 달 녹화 시간을 다 썼어요. 방송은 계속돼요</Notice>}
        {live && record && rec.failReason === "error" && <Notice tone="warn">녹화를 시작하지 못했어요. 방송은 계속돼요</Notice>}
        {micDenied && phase === "setup" && (
          <Notice tone="warn">마이크를 쓸 수 없어요. 크롬 주소창 왼쪽 아이콘에서 마이크를 허용하면 목소리도 나가요. 마이크 없이도 방송은 시작할 수 있어요.</Notice>
        )}
        {isScreen && withCamera && camFailed && <Notice tone="warn">카메라를 켜지 못했어요. 화면만 송출돼요</Notice>}
        {startError && <Notice tone="danger">{startError}</Notice>}
        {live && rec.startedAt && (
          <p className="text-caption-12 text-muted">{now < rec.startedAt.getTime() + RECORDING_MAX_MS ? "녹화 중 (3분까지)" : "녹화가 끝났어요 (3분)"}</p>
        )}

        {live && (
          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
            <StatusBadge status="live" />
            {editing ? (
              <>
                <Input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} aria-label="방송 제목" className="h-10 min-w-0 flex-1" />
                <Button size="sm" onClick={saveTitle} disabled={!title.trim()}>저장</Button>
              </>
            ) : (
              <>
                <h1 className="min-w-0 truncate text-heading-16 lg:text-heading-20">{title}</h1>
                <IconButton label="제목 수정" onClick={() => setEditing(true)} className="size-8">
                  <PencilIcon size={16} />
                </IconButton>
              </>
            )}
            <span className="ml-auto flex items-center gap-2 lg:gap-3">
              <span className={cx("text-number-16", quality !== "good" ? "text-danger" : "text-muted")} title={`연결 ${qualityLabel}`}>
                {formatElapsed(elapsed)}
              </span>
              {quality !== "good" && <span className="text-caption-12 text-danger">연결 {qualityLabel}</span>}
              <Button variant="secondary" size="sm" className="max-lg:hidden" onClick={() => window.open(`/live/${id}`, "_blank")}>
                <LinkIcon size={16} />
                시청자 화면으로 보기
              </Button>
              <Button variant="secondary" size="sm" className="max-lg:hidden" onClick={copyLink}>
                <CopyIcon size={16} />
                링크 복사
              </Button>
              <IconButton label="링크 복사" onClick={copyLink} className="size-8 border border-line bg-raised lg:hidden">
                <CopyIcon size={16} />
              </IconButton>
            </span>
          </div>
        )}

        <div className="relative flex min-h-64 flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-md bg-screen p-4 lg:min-h-0">
          <video ref={preview} autoPlay muted playsInline className={cx("absolute inset-0 size-full object-contain", video ? "" : "hidden", !isScreen && facing === "user" && "-scale-x-100")} />
          {!video &&
            (isScreen && mediaError ? (
              <div className="flex max-w-[560px] flex-col items-center gap-3 text-center">
                <CircleAlertIcon size={24} className="text-subtle" />
                <p className="text-heading-20">화면 공유가 시작되지 않았어요</p>
                <p className="text-body-16 text-subtle">{mediaError}</p>
                <Button size="lg" onClick={shareScreen}>다시 시도</Button>
              </div>
            ) : isScreen ? (
              <div className="flex max-w-[560px] flex-col items-center gap-6">
                <h2 className="text-heading-20">화면 공유 전에 확인해 주세요</h2>
                <ol className="flex w-full flex-col gap-4 rounded-md bg-surface p-5">
                  {[
                    ["\"Chrome 탭\"을 고르면 가장 쉬워요", "유튜브나 문서처럼 한 탭만 보여줄 때 좋아요"],
                    ["\"탭 오디오도 공유\"를 켜야 소리가 나가요", "꺼져 있으면 시청자에게 탭 소리가 들리지 않아요"],
                    ["창이나 전체 화면은 준비가 더 필요할 수 있어요", "맥에서는 화면 기록 권한을 켜고 Chrome을 다시 시작해야 해요"],
                  ].map(([t, d], i) => (
                    <li key={t} className="flex items-start gap-3">
                      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-raised text-caption-12">{i + 1}</span>
                      <div className="flex flex-col">
                        <span className="text-body-16">{t}</span>
                        <span className="text-body-16 text-muted">{d}</span>
                      </div>
                    </li>
                  ))}
                </ol>
                <Button size="lg" onClick={shareScreen}>화면 공유 시작</Button>
              </div>
            ) : asking ? (
              <div className="flex max-w-[560px] flex-col items-center gap-3 text-center">
                <VideoIcon size={24} className="text-subtle" />
                <p className="text-heading-20">다음 창에서 허용을 눌러 주세요</p>
                <p className="text-body-16 text-subtle">카메라와 마이크 권한을 물어봐요</p>
                <Button size="lg" onClick={() => openCamera()}>계속</Button>
              </div>
            ) : (
              <div className="flex w-full max-w-[560px] flex-col items-center gap-4 text-center">
                <VideoIcon size={24} className="text-subtle" />
                <p className="text-heading-20">링크를 먼저 복사해 두세요</p>
                <p className="text-body-16 text-subtle">방송 중에 다른 앱으로 가면 방송이 끝나요</p>
                <div className="flex w-full flex-col gap-2">
                  <Button variant="secondary" size="lg" onClick={copyLink}>링크 복사</Button>
                  <Button size="lg" onClick={() => setAsking(true)}>카메라 켜기</Button>
                </div>
              </div>
            ))}
          {video && isScreen && cam && (
            <div className="absolute bottom-3 right-3 aspect-video w-1/5 min-w-24 overflow-hidden rounded-sm border border-line bg-screen">
              <video ref={camPreview} autoPlay muted playsInline className={cx("size-full -scale-x-100 object-cover", camOff && "invisible")} />
            </div>
          )}
          {video && !isScreen && !live && (
            <IconButton label="앞뒤 카메라 바꾸기" onClick={() => openCamera(facing === "user" ? "environment" : "user")} className="absolute right-3 top-3 bg-overlay text-on-video">
              <SwitchCameraIcon size={20} />
            </IconButton>
          )}
        </div>

        {!live && video && (
          <div className="flex flex-col gap-6 rounded-md bg-surface p-4 lg:flex-row lg:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {isScreen && <AudioMeter track={tabAudio} label="탭 소리" kind="tab" />}
              <AudioMeter track={micOff ? null : mic} label="마이크" />
              {checks.map(([ok, label]) => (
                <div key={label} className="flex items-center gap-2 text-body-16">
                  {ok ? <CircleCheckIcon size={20} className="shrink-0 text-success" /> : <CircleAlertIcon size={20} className="shrink-0 text-live-ink" />}
                  {label}
                </div>
              ))}
              {isScreen && !tabAudio && (
                <Button variant="secondary" size="sm" className="self-start" onClick={shareScreen}>다시 공유</Button>
              )}
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <RecordSwitch checked={record} onChange={setRecord} disabled={phase === "starting"} />
              <Button variant="live" size="lg" onClick={start} disabled={!video || phase === "starting"} loading={phase === "starting"} className="max-lg:w-full">
                {phase === "starting" ? (
                  "방송을 시작하는 중…"
                ) : (
                  <>
                    <RadioIcon size={20} />
                    방송 시작
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
        {status === "live" && !live && <p className="text-caption-12 text-subtle">방송 상태를 확인하는 중이에요…</p>}

        {live && (
          <div className="flex items-center justify-between rounded-md border border-line bg-surface p-3 max-lg:order-2 max-lg:border-0 max-lg:bg-transparent max-lg:p-0">
            <div className="flex items-center gap-2">
              <IconButton label={micOff ? "마이크 켜기" : "마이크 끄기"} onClick={toggleMic} className="border border-line bg-raised max-lg:border-0 max-lg:bg-overlay">
                {micOff ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
              </IconButton>
              {cam && (
                <IconButton label={camOff ? "카메라 켜기" : "카메라 끄기"} onClick={toggleCam} className="border border-line bg-raised">
                  <VideoIcon size={20} />
                </IconButton>
              )}
              {!isScreen && (
                <IconButton label="앞뒤 카메라 바꾸기" onClick={() => openCamera(facing === "user" ? "environment" : "user")} className="border border-line bg-raised max-lg:border-0 max-lg:bg-overlay">
                  <SwitchCameraIcon size={20} />
                </IconButton>
              )}
            </div>
            <Button variant="danger" onClick={() => setEnding(true)}>방송 종료</Button>
          </div>
        )}
      </div>

      <aside className={cx("flex min-h-0 flex-col bg-surface max-lg:rounded-md lg:w-[360px] lg:shrink-0 lg:border-l lg:border-line", live ? "h-60 lg:h-auto" : "max-lg:hidden")}>
        {!live && (
          <div className="flex flex-col gap-2 p-4">
            <p className="text-heading-16">시청자 링크</p>
            <div className="flex items-center gap-2 rounded-sm bg-raised py-2 pl-3 pr-2">
              <span className="min-w-0 flex-1 truncate text-caption-12 text-muted">{linkOf().replace(/^https?:\/\//, "")}</span>
              <Button variant="secondary" size="sm" onClick={copyLink}>
                <CopyIcon size={16} />
                링크 복사
              </Button>
            </div>
          </div>
        )}
        {live && (
          <div role="tablist" className="flex border-b border-line pl-2">
            {(["chat", "mission"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cx("flex h-12 items-end border-b-2 px-4 pb-2 text-heading-16", tab === t ? "border-text text-text" : "border-transparent text-muted hover:text-text")}
              >
                {t === "chat" ? "채팅" : "미션"}
              </button>
            ))}
          </div>
        )}
        <div className={cx("min-h-0 flex-1", live && tab === "mission" && "hidden")}>
          <ChatPanel
            broadcastId={id}
            ownerId={ownerId}
            status={live ? "live" : "ready"}
            room={liveRoom}
            donationTotal={live ? undefined : props.donationTotal}
            hideHeader={live}
            inputClassName="max-lg:hidden"
          />
        </div>
        {live && (
          <div className={cx("min-h-0 flex-1 overflow-y-auto", tab !== "mission" && "hidden")}>
            <MissionList broadcastId={id} room={liveRoom} />
          </div>
        )}
      </aside>
      {ending && (
        <Dialog
          title="방송을 종료할까요?"
          description="시청자 화면도 함께 꺼져요."
          confirmLabel="방송 종료"
          danger
          onClose={() => setEnding(false)}
          onConfirm={() => {
            setEnding(false);
            void finish(true);
          }}
        />
      )}
    </div>
  );
}
