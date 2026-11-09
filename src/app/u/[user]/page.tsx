import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProfile, getUserPlaylists } from "@/lib/soundcloud";
import { Cover } from "@/components/Cover";
import { PlaylistBlock } from "@/components/PlaylistBlock";
import { ProfileSidebar } from "@/components/ProfileSidebar";
import { RememberProfile } from "@/components/Recent";
import { Verified } from "@/components/Icons";

export const dynamic = "force-dynamic";

function decode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ user: string }> }): Promise<Metadata> {
  const { user } = await params;
  try {
    const profile = await getProfile(decode(user));
    if (profile) return { title: `${profile.username} · JACo's Soundcloud` };
  } catch {
    // fall through
  }
  return { title: "JACo's Soundcloud" };
}

export default async function UserPage({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const profile = await getProfile(decode(user));
  if (!profile) notFound();

  const playlists = await getUserPlaylists(profile.id);
  const banner = profile.banner;

  return (
    <div>
      <RememberProfile permalink={profile.permalink} username={profile.username} avatar={profile.avatar} />

      <section
        className="relative border-b border-[#ddd]"
        style={{
          background: banner
            ? `linear-gradient(rgba(0,0,0,.12), rgba(0,0,0,.12)), url(${banner}) center/cover`
            : "linear-gradient(135deg, #8a9ba3 0%, #c9bfae 55%, #e4d6c3 100%)",
        }}
      >
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:py-[30px]">
          <Cover src={profile.avatar} size="t500x500" rounded className="h-[140px] w-[140px] shrink-0 border-2 border-white/80 sm:h-[200px] sm:w-[200px]" />
          <div className="flex flex-col items-start gap-1.5">
            <h1 className="flex items-center gap-2 bg-[#111] px-2.5 py-1 text-xl font-light leading-tight text-white sm:text-[26px]">
              {profile.username}
              {profile.verified && <Verified className="h-5 w-5 text-white" />}
            </h1>
            {profile.fullName && profile.fullName !== profile.username && (
              <p className="bg-[#111] px-2.5 py-0.5 text-sm text-[#ccc]">{profile.fullName}</p>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-5">
        <nav className="flex border-b border-[#e5e5e5]" aria-label="Profile sections">
          <span className="-mb-px border-b-2 border-[#f50] py-3 pr-5 text-[15px] font-bold text-[#333]">
            Playlists
            <span className="ml-2 text-xs font-normal text-[#999]">{playlists.length}</span>
          </span>
        </nav>

        <div className="flex flex-col gap-10 py-7 lg:flex-row lg:gap-12">
          <div className="min-w-0 flex-1">
            {playlists.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-base text-[#333]">{profile.username} hasn&apos;t shared any playlists.</p>
                <p className="mt-1 text-sm text-[#999]">Private playlists aren&apos;t shown here.</p>
              </div>
            ) : (
              playlists.map((p) => <PlaylistBlock key={p.id} playlist={p} owner={profile.permalink} />)
            )}
          </div>
          <ProfileSidebar profile={profile} />
        </div>
      </div>
    </div>
  );
}
