import { readFileSync } from "node:fs";
import path from "node:path";

// shortcut: 약관 초안(docs/)을 빌드할 때 읽어 줄 단위로만 그린다. 표·링크 문법이 필요해지면 마크다운 라이브러리를 붙인다.
export function DocPage({ file, section }: { file: string; section?: string }) {
  let text = readFileSync(path.join(process.cwd(), "../../docs", file), "utf8");
  if (section) {
    const start = text.indexOf(section);
    const end = text.indexOf("\n## ", start + 1);
    text = text.slice(start, end < 0 ? undefined : end);
  }
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-10 text-sm leading-7">
      {text.split("\n").map((line, i) => {
        const clean = line.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        if (line.startsWith("# ")) return <h1 key={i} className="mb-4 text-2xl font-bold">{clean.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} className="mt-6 text-lg font-bold">{clean.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="mt-4 font-semibold">{clean.slice(4)}</h3>;
        if (!line.trim()) return null;
        return <p key={i} className="whitespace-pre-wrap text-muted">{clean}</p>;
      })}
    </article>
  );
}
