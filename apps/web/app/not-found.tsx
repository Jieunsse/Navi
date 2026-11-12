import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <p className="text-5xl font-black text-accent">404</p>
      <p className="text-muted">찾는 페이지가 없어요</p>
      <Link href="/" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">
        홈으로 가기
      </Link>
    </div>
  );
}
