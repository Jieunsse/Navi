"use client";
import { useEffect, useRef } from "react";

/** 소리 막대. 탭 소리와 마이크 소리를 따로 보여준다(4-4). */
export function AudioMeter({ track, label }: { track: MediaStreamTrack | null; label: string }) {
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

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-14 shrink-0 text-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {track ? <div ref={bar} className="h-full w-0 rounded-full bg-accent transition-[width] duration-75" /> : null}
      </div>
      {!track && <span className="text-danger">꺼짐</span>}
    </div>
  );
}
