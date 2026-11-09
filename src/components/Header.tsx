"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Cloud, Search } from "./Icons";
import { routeFromInput } from "@/lib/format";

export function Header() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const route = routeFromInput(value);
    if (!route) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setValue("");
    router.push(route);
  };

  return (
    <header className="sticky top-0 z-40 h-[46px] bg-[#333] text-white">
      <div className="mx-auto flex h-full max-w-[1240px] items-center px-3 sm:px-5">
        <Link href="/" className="flex h-full shrink-0 items-center gap-2 pr-4 sm:pr-6" aria-label="JACo's Soundcloud home">
          <Cloud className="h-8 w-8 text-[#f50]" />
          <span className="hidden text-[15px] font-bold tracking-tight sm:block">JACo&apos;s Soundcloud</span>
        </Link>

        <nav className="hidden h-full items-stretch border-x border-[#111] sm:flex">
          <Link href="/" className="flex items-center px-5 text-sm text-[#ccc] hover:text-white">
            Home
          </Link>
        </nav>

        <form onSubmit={submit} className="ml-3 flex-1 sm:ml-5 sm:max-w-[560px]" role="search">
          <label className="relative block">
            <span className="sr-only">SoundCloud profile URL</span>
            <input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setInvalid(false);
              }}
              placeholder="soundcloud.com/username"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className={`h-7 w-full rounded-[3px] border-0 bg-[#e8e8e8] pl-2.5 pr-9 text-sm text-[#333] placeholder:text-[#999] outline-none focus:bg-white ${
                invalid ? "ring-2 ring-[#f50]" : ""
              }`}
            />
            <button type="submit" aria-label="Open profile" className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-[#666] hover:text-[#111]">
              <Search className="h-4 w-4" />
            </button>
          </label>
        </form>
      </div>
    </header>
  );
}
