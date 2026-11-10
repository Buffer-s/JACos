import { forkLocalPlaylist } from '../lib/localLibrary';
import { navigate } from '../lib/router';
import { toast } from '../lib/toast';
import type { SCTrack } from '../lib/soundcloud';

/**
 * Fork — copies any playlist (SoundCloud, public, or local) into a private
 * local copy where you can add and remove tracks.
 */
export default function ForkButton({
  name,
  tracks,
  className,
}: {
  name: string;
  tracks: SCTrack[];
  className?: string;
}) {
  const fork = () => {
    if (tracks.length === 0) {
      toast('Nothing to fork — this playlist is empty.');
      return;
    }
    const pl = forkLocalPlaylist(name, tracks);
    if (!pl) {
      toast('Could not fork — local storage is full.');
      return;
    }
    toast(`Forked “${name}” — edit away, it’s yours.`, {
      actionLabel: 'Open copy',
      onAction: () => navigate(`/playlists/${encodeURIComponent(pl.id)}`),
    });
  };

  return (
    <button className={className ?? 'btn btn-outline btn-block'} onClick={fork} title="Make your own private copy">
      <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }}>
        <circle cx="5" cy="3.5" r="1.8" /><circle cx="5" cy="14.5" r="1.8" /><circle cx="13" cy="9" r="1.8" />
        <path d="M5 5.3v7.4M6.7 4.4 11.6 8.3M6.7 13.6 11.6 9.7" />
      </svg>
      Fork
    </button>
  );
}
