"use client";
import { useEffect, useRef } from "react";
import { cx, MicIcon, Volume2Icon } from "@/shared/ui";

/** 소리 막대(시안의 MicMeter). 탭 소리와 마이크 소리를 따로 보여준다(4-4). */
export function AudioMeter({ track, label, kind = "mic" }: { track: MediaStreamTrack | null; label: string; kind?: "mic" | "tab" }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!track) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      if (bar.current) bar.current.style.width = `${Math.min(100, (peak / 64) * 100)}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [track]);

  const Icon = kind === "tab" ? Volume2Icon : MicIcon;
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-caption-12 text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon size={16} className={cx("shrink-0", track ? "text-muted" : "text-danger")} />
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden>
          {track ? <div ref={bar} className="h-full w-0 rounded-full bg-success transition-[width] duration-75" /> : null}
        </div>
        {!track && <span className="text-caption-12 text-danger">꺼짐</span>}
      </div>
    </div>
  );
}
