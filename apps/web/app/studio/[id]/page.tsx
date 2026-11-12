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
import { AudioMeter } from "@/features/studio/AudioMeter";
import { RecordSwitch } from "@/features/studio/RecordSwitch";
import { useRecordingState } from "@/features/studio/useRecordingState";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatElapsed } from "@/shared/lib/format";
import { Button, Center, Input, Notice } from "@/shared/ui";

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
  if (b === null) return <Center><p className="text-muted">방송을 찾을 수 없어요</p></Center>;
  if (b.ownerId !== me.uid) return <Center><p className="text-muted">이 방송의 송출 화면은 방송자만 열 수 있어요</p></Center>;
  if (firstStatus === "live")
    return (
      <Center>
        <p className="font-semibold">이미 방송 중인 방송이에요</p>
        <p className="text-sm text-muted">송출 화면에는 다시 들어갈 수 없어요. 방송을 켠 탭에서 이어서 해 주세요.</p>
        <Link href={`/live/${id}`} className="text-sm text-accent underline">시청자 화면으로 보기</Link>
      </Center>
    );
  if (firstStatus === "ended") return <Ended id={id} />;
  return <Publisher id={id} ownerId={b.ownerId} title={b.title} sourceType={b.sourceType} status={b.status} startedAt={b.startedAt} isTestBroadcaster={me.uid === TEST_ACCOUNTS.broadcaster} />;
}

function Ended({ id, recording }: { id: string; recording?: boolean }) {
  return (
    <Center>
      <p className="text-lg font-semibold">방송이 끝났어요. 시청자에게도 끝났다고 보여요</p>
      {recording && <p className="text-sm text-muted">다시보기를 만드는 중이에요. 다 되면 내 방송 관리에서 공개할 수 있어요</p>}
      <div className="flex gap-2">
        <Link href="/studio" className="inline-flex h-10 items-center rounded-lg bg-surface-2 px-4 text-sm font-semibold">내 방송 관리</Link>
        <Link href="/studio/new" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">새 방송 만들기</Link>
      </div>
      <Link href={`/live/${id}`} className="text-xs text-muted underline">방송 화면 보기</Link>
    </Center>
  );
}

function Publisher(props: { id: string; ownerId: string; title: string; sourceType: "screen" | "camera"; status: string; startedAt: Date | null; isTestBroadcaster: boolean }) {
  const { id, ownerId, sourceType, status, startedAt, isTestBroadcaster } = props;
  const isScreen = sourceType === "screen";
  const [phase, setPhase] = useState<Phase>("setup");
  const [video, setVideo] = useState<MediaStreamTrack | null>(null);
  const [tabAudio, setTabAudio] = useState<MediaStreamTrack | null>(null);
  const [mic, setMic] = useState<MediaStreamTrack | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [mediaError, setMediaError] = useState("");
  const [startError, setStartError] = useState("");
  const [quality, setQuality] = useState<Quality>("good");
  const [unstableSince, setUnstableSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [title, setTitle] = useState(props.title);
  const [asking, setAsking] = useState(false);
  const [record, setRecord] = useState(false); // 방송 시작 전에만 고른다(4-4의 5번)
  const rec = useRecordingState(id);
  const [liveRoom, setLiveRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const endingRef = useRef(false);
  const warnedRef = useRef(false);
  const preview = useRef<HTMLVideoElement>(null);
  const tracks = useRef({ video, tabAudio, mic });
  useEffect(() => {
    tracks.current = { video, tabAudio, mic };
  }, [video, tabAudio, mic]);
  const linkOf = () => `${location.origin}/live/${id}`;

  useEffect(() => {
    if (preview.current) preview.current.srcObject = video ? new MediaStream([video]) : null;
  }, [video]);

  useEffect(() => () => {
    const t = tracks.current;
    stop(t.video, t.tabAudio, t.mic);
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
    stop(t.video, t.tabAudio, t.mic);
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

  async function saveTitle() {
    try {
      await apiFetch(api.updateBroadcast, { title: title.trim() }, { id });
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      {phase === "live" && micOff && <Notice tone="danger">마이크가 꺼져 있어요. 시청자에게 내 목소리가 들리지 않아요</Notice>}
      {showUnstable && (
        <Notice tone="warn">
          {isScreen
            ? "인터넷이 불안정해서 시청자 화면이 끊길 수 있어요. 다른 탭의 동영상이나 내려받기를 멈춰 보세요"
            : "인터넷이 불안정해서 시청자 화면이 끊길 수 있어요. 와이파이가 잘 잡히는 곳으로 옮겨 보세요"}
        </Notice>
      )}
      {phase === "live" && !isScreen && <Notice tone="warn">화면을 켜 둔 채로 두세요. 다른 앱으로 가면 방송이 끝나요</Notice>}
      {phase === "live" && record && rec.failReason === "quota" && <Notice tone="warn">이번 달 녹화 시간을 다 썼어요. 방송은 계속돼요</Notice>}
      {phase === "live" && record && rec.failReason === "error" && <Notice tone="warn">녹화를 시작하지 못했어요. 방송은 계속돼요</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        {phase === "live" ? (
          <>
            <span className="rounded bg-live px-2 py-0.5 text-xs font-bold text-white">LIVE</span>
            <span className="font-mono text-sm">{formatElapsed(elapsed)}</span>
            <span className={`text-xs ${quality === "good" ? "text-muted" : "text-danger"}`}>연결 {qualityLabel}</span>
            {rec.startedAt && <span className="text-xs text-muted">{now < rec.startedAt.getTime() + RECORDING_MAX_MS ? "● 녹화 중 (3분까지)" : "녹화가 끝났어요 (3분)"}</span>}
          </>
        ) : (
          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-bold text-muted">준비 중</span>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={copyLink}>링크 복사</Button>
          {phase === "live" && (
            <Button variant="secondary" onClick={() => window.open(`/live/${id}`, "_blank")}>시청자 화면으로 보기</Button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} aria-label="방송 제목" />
        {phase === "live" && <Button variant="secondary" className="shrink-0" onClick={saveTitle} disabled={!title.trim()}>제목 저장</Button>}
      </div>

      <div className={`relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl bg-black ${video ? "" : "min-h-[22rem]"}`}>
        <video ref={preview} autoPlay muted playsInline className={`size-full object-contain ${video ? "" : "hidden"} ${!isScreen && facing === "user" ? "-scale-x-100" : ""}`} />
        {!video && (
          <div className="flex max-w-md flex-col gap-4 p-6 text-left text-sm">
            {isScreen ? (
              <>
                <p className="text-base font-semibold">화면 공유 전에 확인해 주세요</p>
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted">
                  <li>공유 창에서 <b className="text-text">Chrome 탭</b>을 고르면 가장 쉬워요.</li>
                  <li><b className="text-text">탭 오디오도 공유</b>가 켜져 있어야 소리가 나가요.</li>
                  <li>창이나 전체 화면을 고르면 맥에서 화면 기록 권한과 크롬 재시작이 필요할 수 있어요.</li>
                </ol>
                <Button onClick={shareScreen}>화면 공유 시작</Button>
              </>
            ) : asking ? (
              <>
                <p className="text-base font-semibold">다음 창에서 허용을 눌러 주세요</p>
                <p className="text-muted">카메라와 마이크 권한을 물어봐요.</p>
                <Button onClick={() => openCamera()}>계속</Button>
              </>
            ) : (
              <>
                <p className="text-base font-semibold">링크를 먼저 복사해 두세요</p>
                <p className="text-muted">방송 중에 다른 앱으로 가면 방송이 끝나요. 메신저에 보낼 링크는 지금 복사해 두세요.</p>
                <Button variant="secondary" onClick={copyLink}>링크 복사</Button>
                <Button onClick={() => setAsking(true)}>카메라 켜기</Button>
              </>
            )}
          </div>
        )}
        {video && !isScreen && (
          <button onClick={() => openCamera(facing === "user" ? "environment" : "user")} className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-2 text-xs" aria-label="앞뒤 카메라 바꾸기">
            🔄 카메라 바꾸기
          </button>
        )}
      </div>

      {mediaError && <Notice tone="danger">{mediaError}</Notice>}
      {video && isScreen && !tabAudio && (
        <Notice tone="warn">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>탭 소리가 들어오지 않아요. 탭 오디오 공유를 켜고 다시 공유해 주세요</span>
            {phase === "setup" && <Button variant="secondary" onClick={shareScreen}>다시 공유</Button>}
          </div>
        </Notice>
      )}
      {micDenied && phase === "setup" && (
        <Notice tone="warn">마이크를 쓸 수 없어요. 크롬 주소창 왼쪽 아이콘에서 마이크를 허용하면 목소리도 나가요. 마이크 없이도 방송은 시작할 수 있어요.</Notice>
      )}

      {video && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          {isScreen && <AudioMeter track={tabAudio} label="탭 소리" />}
          <AudioMeter track={micOff ? null : mic} label="마이크" />
        </div>
      )}

      {startError && <Notice tone="danger">{startError}</Notice>}

      {phase !== "live" && <RecordSwitch checked={record} onChange={setRecord} disabled={phase === "starting"} />}

      <div className="flex flex-wrap gap-2">
        {phase !== "live" ? (
          <Button className="flex-1" onClick={start} disabled={!video || phase === "starting"} loading={phase === "starting"}>
            {phase === "starting" ? "방송을 시작하는 중…" : "방송 시작"}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={toggleMic}>{micOff ? "마이크 켜기" : "마이크 끄기"}</Button>
            <Button variant="danger" className="ml-auto" onClick={() => confirm("방송을 끝낼까요? 끝낸 방송은 다시 켤 수 없어요.") && void finish(true)}>
              방송 종료
            </Button>
          </>
        )}
      </div>
      {status === "live" && phase !== "live" && <p className="text-xs text-muted">방송 상태를 확인하는 중이에요…</p>}
      <div className="h-[420px]">
        <ChatPanel broadcastId={id} ownerId={ownerId} status={phase === "live" ? "live" : "ready"} room={liveRoom} />
      </div>
    </div>
  );
}
