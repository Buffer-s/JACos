import { getStream } from "@/lib/soundcloud";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trackId = Number(id);
  if (!Number.isInteger(trackId) || trackId <= 0) {
    return Response.json({ error: "Invalid track id" }, { status: 400 });
  }

  try {
    const stream = await getStream(trackId);
    if (!stream) return Response.json({ error: "This track can't be streamed" }, { status: 404 });
    return Response.json(stream, { headers: { "cache-control": "private, max-age=600" } });
  } catch {
    return Response.json({ error: "Couldn't reach SoundCloud" }, { status: 502 });
  }
}
