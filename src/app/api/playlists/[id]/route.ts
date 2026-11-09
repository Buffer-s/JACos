import { getPlaylistById } from "@/lib/soundcloud";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playlistId = Number(id);
  if (!Number.isInteger(playlistId) || playlistId <= 0) {
    return Response.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  try {
    const playlist = await getPlaylistById(playlistId);
    if (!playlist) return Response.json({ error: "Playlist not found" }, { status: 404 });
    return Response.json(playlist, { headers: { "cache-control": "private, max-age=120" } });
  } catch {
    return Response.json({ error: "Couldn't reach SoundCloud" }, { status: 502 });
  }
}
