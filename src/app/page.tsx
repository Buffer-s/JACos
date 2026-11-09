import { HomeSearch } from "@/components/HomeSearch";
import { RecentProfiles } from "@/components/Recent";
import { Cloud } from "@/components/Icons";

export default function HomePage() {
  return (
    <div>
      <section className="border-b border-[#e5e5e5] bg-[#f2f2f2]">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-6 px-5 py-14 sm:py-20">
          <div className="flex items-center gap-4">
            <Cloud className="h-14 w-14 shrink-0 text-[#f50]" />
            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#111] sm:text-4xl">JACo&apos;s Soundcloud</h1>
              <p className="mt-0.5 text-sm text-[#666] sm:text-base">Just Another Copy of Sweden&apos;s Soundcloud</p>
            </div>
          </div>
          <HomeSearch />
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-5 pb-16">
        <RecentProfiles />
      </div>
    </div>
  );
}
