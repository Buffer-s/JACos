"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cover } from "./Cover";

type Item = { permalink: string; username: string; avatar: string | null };
const KEY = "jaco:recent";

function read(): Item[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function RememberProfile(item: Item) {
  useEffect(() => {
    const list = read().filter((i) => i.permalink !== item.permalink);
    list.unshift(item);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8)));
  }, [item.permalink, item.username, item.avatar]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function RecentProfiles() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => setItems(read()), []);

  if (items.length === 0) return null;

  return (
    <section className="mt-12 w-full max-w-[560px]">
      <div className="mb-3 flex items-baseline justify-between border-b border-[#e5e5e5] pb-2">
        <h2 className="text-sm font-bold text-[#333]">Recently opened</h2>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(KEY);
            setItems([]);
          }}
          className="text-xs text-[#999] hover:text-[#333]"
        >
          Clear
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {items.map((i) => (
          <li key={i.permalink}>
            <Link href={`/u/${i.permalink}`} className="group flex items-center gap-2 py-1.5">
              <Cover src={i.avatar} size="t120x120" rounded className="h-9 w-9 shrink-0" />
              <span className="truncate text-[13px] text-[#333] group-hover:text-[#f50]">{i.username}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
