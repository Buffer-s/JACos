"use client";

import { usePlayer } from "./PlayerProvider";
import { Pause, Play, Spinner } from "./Icons";
import type { Track } from "@/lib/types";

type Props = {
  playlistId: number;
  /** Pass the complete track list when it's available to skip a network round trip. */
  tracks?: Track[];
  size?: number;
  label?: string;
};

export function PlaylistPlayButton({ playlistId, tracks, size = 48, label = "Play playlist" }: Props) {
  const { sourceId, playing, busyPlaylistId, toggle, playQueue, playPlaylist } = usePlayer();
  const active = sourceId === playlistId;
  const busy = busyPlaylistId === playlistId;

  const onClick = () => {
    if (active) return toggle();
    if (tracks && tracks.length > 0) return playQueue(tracks, undefined, playlistId);
    void playPlaylist(playlistId);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active && playing ? "Pause" : label}
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-[#f50] text-white transition-colors hover:bg-[#e04600]"
    >
      {busy ? (
        <Spinner className="h-1/2 w-1/2" />
      ) : active && playing ? (
        <Pause className="h-1/2 w-1/2" />
      ) : (
        <Play className="h-1/2 w-1/2 translate-x-[1px]" />
      )}
    </button>
  );
}
