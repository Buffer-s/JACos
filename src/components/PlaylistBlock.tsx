import Link from "next/link";
import { Cover } from "./Cover";
import { PlaylistPlayButton } from "./PlaylistPlayButton";
import { TrackList } from "./TrackList";
import { formatLongDuration, timeAgo } from "@/lib/format";
import type { Playlist } from "@/lib/types";

const PREVIEW = 5;

export function PlaylistBlock({ playlist, owner }: { playlist: Playlist; owner: string }) {
  const href = `/u/${encodeURIComponent(owner)}/sets/${encodeURIComponent(playlist.slug)}`;
  const preview = playlist.tracks.slice(0, PREVIEW);
  const hidden = Math.max(0, playlist.trackCount - preview.length);

  return (
    <article className="flex gap-4 border-b border-[#e5e5e5] py-6 first:pt-0 sm:gap-5">
      <Link href={href} className="block h-[110px] w-[110px] shrink-0 sm:h-[160px] sm:w-[160px]" aria-label={playlist.title}>
        <Cover src={playlist.artwork} size="t300x300" className="h-full w-full" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <PlaylistPlayButton playlistId={playlist.id} size={40} />
          <div className="min-w-0">
            <p className="truncate text-xs text-[#999]">{playlist.ownerName}</p>
            <h2 className="truncate text-base text-[#333] sm:text-lg">
              <Link href={href} className="hover:text-[#666]">
                {playlist.title}
              </Link>
            </h2>
          </div>
          <div className="ml-auto hidden shrink-0 text-right text-xs text-[#999] sm:block">
            <p>{timeAgo(playlist.createdAt)}</p>
            {playlist.isAlbum && <p className="mt-1 inline-block rounded-[2px] border border-[#ccc] px-1.5 text-[11px] uppercase text-[#666]">Album</p>}
          </div>
        </div>

        {preview.length > 0 && (
          <div className="mt-3 hidden sm:block">
            <TrackList tracks={preview} playlistId={playlist.id} compact />
          </div>
        )}

        <p className="mt-2 text-xs text-[#999]">
          {hidden > 0 && preview.length > 0 ? (
            <Link href={href} className="text-[#333] hover:text-[#f50]">
              View {hidden} more {hidden === 1 ? "track" : "tracks"}
            </Link>
          ) : (
            <Link href={href} className="hover:text-[#333]">
              {playlist.trackCount} {playlist.trackCount === 1 ? "track" : "tracks"}
            </Link>
          )}
          {playlist.duration > 0 && <span> · {formatLongDuration(playlist.duration)}</span>}
        </p>
      </div>
    </article>
  );
}
