import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PlayerProvider } from "@/components/PlayerProvider";
import { PlayerBar } from "@/components/PlayerBar";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "JACo's Soundcloud",
  description: "Just Another Copy of Sweden's Soundcloud",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-white text-[#333] antialiased">
        <PlayerProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[#e5e5e5] bg-[#f7f7f7] pb-20 pt-6 text-xs text-[#999]">
            <div className="mx-auto flex max-w-[1240px] flex-col gap-1 px-5 sm:flex-row sm:items-center sm:justify-between">
              <p>
                <span className="font-bold text-[#666]">JACo&apos;s Soundcloud</span> · Just Another Copy of Sweden&apos;s Soundcloud
              </p>
              <p>v0.0.1 · Not affiliated with SoundCloud. All audio belongs to its uploaders.</p>
            </div>
          </footer>
          <PlayerBar />
        </PlayerProvider>
      </body>
    </html>
  );
}
