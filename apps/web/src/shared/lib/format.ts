const timeFmt = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const formatTime = (d: Date | string | null) => (d ? timeFmt.format(new Date(d)) : "");

export function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export const sourceLabel = { screen: "화면 공유", camera: "카메라" } as const;
