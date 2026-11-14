import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SessionProvider } from "@/entities/session/session";
import { SidebarDock } from "@/widgets/sidebar/Sidebar";
import { Header } from "@/widgets/header/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "나비 — 설치 없이 바로 켜는 방송",
  description: "프로그램 설치도 구독자 조건도 없이 브라우저에서 바로 켜는 방송 플랫폼",
};

export const viewport: Viewport = { themeColor: "#0b0b0c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* 첫 그림 전에 저장한 화면 모드를 적용해 깜빡이지 않게 한다. 저장값이 없으면 어두운 화면. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("nabi-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}` }} />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="flex min-h-full flex-col">
        <SessionProvider>
          <Header />
          <div className="flex flex-1">
            <SidebarDock />
            <main className="flex min-w-0 flex-1 flex-col">{children}</main>
          </div>
        </SessionProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
