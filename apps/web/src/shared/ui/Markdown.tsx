import { readFileSync } from "node:fs";
import path from "node:path";
import { LinkTabs } from "./parts";

const docTabs = [
  { href: "/terms", label: "이용약관" },
  { href: "/terms/streamer", label: "방송자 이용약관" },
  { href: "/privacy", label: "개인정보 처리방침" },
];

// shortcut: 약관 초안(docs/)을 빌드할 때 읽어 줄 단위로만 그린다. 표·링크 문법이 필요해지면 마크다운 라이브러리를 붙인다.
export function DocPage({ file, section }: { file: string; section?: string }) {
  let text = readFileSync(path.join(process.cwd(), "../../docs", file), "utf8");
  if (section) {
    const start = text.indexOf(section);
    const end = text.indexOf("\n## ", start + 1);
    text = text.slice(start, end < 0 ? undefined : end);
  }
  return (
    <article className="mx-auto flex w-full max-w-[800px] flex-col gap-3 px-4 py-8 text-body-16">
      {text.split("\n").map((line, i) => {
        const clean = line.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        if (line.startsWith("# "))
          return (
            <div key={i} className="mb-4 flex flex-col gap-6">
              <h1 className="text-heading-28">{clean.slice(2)}</h1>
              <LinkTabs items={docTabs} />
            </div>
          );
        if (line.startsWith("## ")) return <h2 key={i} className="mt-6 text-heading-16">{clean.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="mt-4 text-heading-16">{clean.slice(4)}</h3>;
        if (!line.trim()) return null;
        return <p key={i} className="whitespace-pre-wrap text-muted">{clean}</p>;
      })}
    </article>
  );
}
