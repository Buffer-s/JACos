"use client";

import { Cloud } from "@/components/Icons";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col items-center px-5 py-24 text-center">
      <Cloud className="h-14 w-14 text-[#ddd]" />
      <h1 className="mt-4 text-2xl font-light text-[#333]">Something went wrong talking to SoundCloud</h1>
      <p className="mt-2 max-w-md text-sm text-[#999]">This is usually temporary. Give it a moment and try again.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-[3px] bg-[#f50] px-5 py-2 text-sm font-bold text-white hover:bg-[#e04600]">
        Try again
      </button>
    </div>
  );
}
