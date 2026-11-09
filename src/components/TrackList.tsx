"use client";

import { usePlayer } from "./PlayerProvider";
import { Pause, Play, Spinner } from "./Icons";
import { art, formatTime } from "@/lib/format";
import type { Track } from "@/lib/types";

type Props = {
  tracks: Track[];
  playlistId: number;
  /** True when `tracks` is the whole playlist; otherwise the full list is fetched on click. */
  complete?: boolean;
  compact?: boolean;
};

export function TrackList({ tracks, playlistId, complete = false, compact = false }: Props) {
  const { track: current, playing, loading, toggle, playQueue, playPlaylist } = usePlayer();

  return (
    <ol className="text-[13px]">
      {tracks.map((t, i) => {
        const isCurrent = current?.id === t.id;
        const cover = art(t.artwork, "t120x120");

        const onClick = () => {
          if (!t.playable) return;
          if (isCurrent) return toggle();
          if (complete) playQueue(tracks, t.id, playlistId);
          else void playPlaylist(playlistId, t.id);
        };

        return (
          <li key={t.id} className="border-b border-[#f2f2f2] last:border-b-0">
            <button
              type="button"
              onClick={onClick}
              disabled={!t.playable}
              className={`group flex w-full items-center gap-3 px-2 text-left ${compact ? "h-8" : "h-[42px]"} ${
                t.playable ? "hover:bg-[#f7f7f7]" : "cursor-not-allowed"
              }`}
            >
              <div className={`relative shrink-0 bg-[#e5e5e5] ${compact ? "h-6 w-6" : "h-[30px] w-[30px]"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {cover && <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
                {t.playable && (
                  <span
                    className={`absolute inset-0 flex items-center justify-center bg-black/45 text-white ${
                      isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {isCurrent && loading && !playing ? (
                      <Spinner className="h-3.5 w-3.5" />
                    ) : isCurrent && playing ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </span>
                )}
              </div>
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[#999]">{i + 1}</span>
              <span className={`min-w-0 flex-1 truncate ${!t.playable ? "text-[#bbb]" : isCurrent ? "font-bold text-[#f50]" : "text-[#333]"}`}>
                <span className={isCurrent ? "text-[#f50]" : "text-[#999]"}>{t.artist}</span>
                <span className="px-1.5 text-[#ccc]">–</span>
                {t.title}
              </span>
              {!t.playable && <span className="shrink-0 text-xs text-[#bbb]">Unavailable</span>}
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[#999]">{formatTime(t.duration)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
