"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { routeFromInput } from "@/lib/format";

export function HomeSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const route = routeFromInput(value);
    if (!route) return setInvalid(true);
    router.push(route);
  };

  return (
    <form onSubmit={submit} className="w-full max-w-[560px]">
      <label htmlFor="profile-url" className="mb-2 block text-sm font-bold text-[#333]">
        SoundCloud profile
      </label>
      <div className="flex">
        <input
          id="profile-url"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          placeholder="soundcloud.com/bfrend"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={`h-11 min-w-0 flex-1 rounded-l-[3px] border border-r-0 bg-white px-3 text-base text-[#333] outline-none placeholder:text-[#aaa] focus:border-[#999] ${
            invalid ? "border-[#f50]" : "border-[#ccc]"
          }`}
        />
        <button type="submit" className="h-11 rounded-r-[3px] bg-[#f50] px-6 text-sm font-bold text-white hover:bg-[#e04600]">
          Show playlists
        </button>
      </div>
      <p className={`mt-2 text-xs ${invalid ? "text-[#f50]" : "text-[#999]"}`}>
        {invalid ? "Enter a profile link or a username." : "Paste a profile link, or just the username."}
      </p>
    </form>
  );
}
