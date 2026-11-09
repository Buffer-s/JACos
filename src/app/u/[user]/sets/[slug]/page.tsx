import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlaylistBySlug, getProfile } from "@/lib/soundcloud";
import { art, formatLongDuration, timeAgo } from "@/lib/format";
import { Cover } from "@/components/Cover";
import { PlaylistPlayButton } from "@/components/PlaylistPlayButton";
import { TrackList } from "@/components/TrackList";
import { ProfileSidebar } from "@/components/ProfileSidebar";
import { Cloud } from "@/components/Icons";

export const dynamic = "force-dynamic";

type Params = Promise<{ user: string; slug: string }>;

function decode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { user, slug } = await params;
  try {
    const p = await getPlaylistBySlug(decode(user), decode(slug));
    if (p) return { title: `${p.title} by ${p.ownerName} · JACo's Soundcloud` };
  } catch {
    // fall through
  }
  return { title: "JACo's Soundcloud" };
}

export default async function PlaylistPage({ params }: { params: Params }) {
  const { user, slug } = await params;
  const playlist = await getPlaylistBySlug(decode(user), decode(slug));
  if (!playlist) notFound();

  const profile = await getProfile(playlist.ownerPermalink || decode(user));
  const cover = art(playlist.artwork, "t500x500");
  const playable = playlist.tracks.filter((t) => t.playable).length;

  return (
    <div>
      <section className="relative overflow-hidden bg-[#555]">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl" />
        )}
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto flex max-w-[1240px] flex-col-reverse gap-6 px-5 py-6 sm:min-h-[340px] sm:flex-row sm:justify-between sm:py-[30px]">
          <div className="flex flex-col justify-between gap-6">
            <div className="flex items-start gap-4">
              <PlaylistPlayButton playlistId={playlist.id} tracks={playlist.tracks} size={64} />
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <Link
                  href={`/u/${encodeURIComponent(playlist.ownerPermalink)}`}
                  className="bg-[#111]/90 px-2 py-0.5 text-sm text-[#ccc] hover:text-white"
                >
                  {playlist.ownerName}
                </Link>
                <h1 className="bg-[#111]/90 px-2 py-1 text-xl font-light leading-snug text-white sm:text-[24px]">{playlist.title}</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/85">
              {playlist.isAlbum && <span className="rounded-[2px] border border-white/60 px-1.5 uppercase">Album</span>}
              <span>
                {playlist.trackCount} {playlist.trackCount === 1 ? "track" : "tracks"}
              </span>
              {playlist.duration > 0 && <span>{formatLongDuration(playlist.duration)}</span>}
              {playlist.createdAt && <span>{timeAgo(playlist.createdAt)}</span>}
            </div>
          </div>

          <Cover src={playlist.artwork} size="t500x500" className="h-[200px] w-[200px] shrink-0 self-start sm:h-[300px] sm:w-[300px] lg:h-[340px] lg:w-[340px]" />
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-5">
        <div className="flex flex-col gap-10 py-7 lg:flex-row lg:gap-12">
          <div className="min-w-0 flex-1">
            {playlist.description && (
              <p className="mb-6 whitespace-pre-line break-words border-b border-[#e5e5e5] pb-6 text-[13px] leading-relaxed text-[#333]">
                {playlist.description}
              </p>
            )}

            {playlist.tracks.length === 0 ? (
              <div className="py-16 text-center">
                <Cloud className="mx-auto h-10 w-10 text-[#ddd]" />
                <p className="mt-3 text-base text-[#333]">This playlist is empty.</p>
              </div>
            ) : (
              <>
                {playable < playlist.tracks.length && (
                  <p className="mb-3 text-xs text-[#999]">
                    {playlist.tracks.length - playable} {playlist.tracks.length - playable === 1 ? "track isn't" : "tracks aren't"} available for streaming.
                  </p>
                )}
                <TrackList tracks={playlist.tracks} playlistId={playlist.id} complete />
              </>
            )}
          </div>

          {profile && (
            <div className="w-full shrink-0 lg:w-[300px]">
              <Link href={`/u/${encodeURIComponent(profile.permalink)}`} className="group mb-5 flex items-center gap-3">
                <Cover src={profile.avatar} size="t200x200" rounded className="h-14 w-14 shrink-0" />
                <span className="truncate text-[15px] text-[#333] group-hover:text-[#f50]">{profile.username}</span>
              </Link>
              <ProfileSidebar profile={profile} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
