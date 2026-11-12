import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SessionProvider } from "@/entities/session/session";
import { Header } from "@/widgets/header/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "나비 — 설치 없이 바로 켜는 방송",
  description: "프로그램 설치도 구독자 조건도 없이 브라우저에서 바로 켜는 방송 플랫폼",
};

export const viewport: Viewport = { themeColor: "#0e0f12", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="flex min-h-full flex-col">
        <SessionProvider>
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
        </SessionProvider>
        <Toaster theme="dark" position="top-center" />
      </body>
    </html>
  );
}
