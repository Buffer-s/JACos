import { useEffect, useState } from 'react';
import {
  detectClientId,
  getApiProxy,
  getClientIdSource,
  getCustomClientId,
  setApiProxy,
  setCustomClientId,
  clearCustomClientId,
  resolveUrl,
  getActiveRouteLabel,
  ClientIdUnavailableError,
} from '../lib/soundcloud';
import {
  clearAudioCache,
  formatBytes,
  getAudioCacheStats,
  isAudioCacheEnabled,
  audioCacheSupported,
  setAudioCacheEnabled,
  type AudioCacheStats,
} from '../lib/audioCache';
import { forgetSourceMemory, getDownloadApi, getSourceMemory, setDownloadApi, type SourceMemory } from '../lib/mediaSources';
import { version } from '../../package.json';
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme';
import { removeKey } from '../lib/storage';
import { toast } from '../lib/toast';
import GitHubMark from './GitHubMark';

const GITHUB_URL = 'https://github.com/bufferclick/JACos';

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [clientId, setClientId] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [proxy, setProxy] = useState('');
  const [testing, setTesting] = useState(false);
  const [route, setRoute] = useState<string>('Not detected yet');
  const [themePref, setThemePrefState] = useState<ThemePref>(() => getThemePref());
  const [cacheStats, setCacheStats] = useState<AudioCacheStats | null>(null);
  const [cacheOn, setCacheOn] = useState<boolean>(() => isAudioCacheEnabled());
  const [downloadApi, setDownloadApiState] = useState('');
  const [sourceMemory, setSourceMemory] = useState<SourceMemory | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  const refreshPlaybackInfo = () => {
    void getAudioCacheStats().then(setCacheStats).catch(() => setCacheStats(null));
    setSourceMemory(getSourceMemory());
    setCacheOn(isAudioCacheEnabled());
  };

  useEffect(() => {
    if (!open) return;
    setClientId(getCustomClientId() ?? '');
    setProxy(getApiProxy());
    setSource(getClientIdSource());
    setRoute(getActiveRouteLabel());
    setDownloadApiState(getDownloadApi());
    refreshPlaybackInfo();
    // warm detection in the background so the status line is truthful
    detectClientId()
      .then(() => setSource(getClientIdSource()))
      .catch(() => setSource(getClientIdSource()));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const saveClientId = () => {
    const v = clientId.trim();
    if (!v) {
      clearCustomClientId();
      toast('Custom client_id removed — auto-detection will be used.');
    } else {
      if (!/^[0-9a-zA-Z]{16,64}$/.test(v)) {
        toast('That does not look like a client_id (16–64 alphanumerics).');
        return;
      }
      setCustomClientId(v);
      toast('Custom client_id saved.');
    }
    setSource(getClientIdSource());
  };

  const saveProxy = () => {
    setApiProxy(proxy);
    toast(proxy.trim() ? 'API proxy saved.' : 'API proxy removed.');
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      await detectClientId({ forceRefresh: true });
      const target = await resolveUrl('https://soundcloud.com/soundcloud');
      if (target.kind === 'user') {
        toast(`Connection OK — resolved "${target.user.username}" (id ${target.user.id}).`);
      } else {
        toast('Connection OK — api-v2 responded.');
      }
      setSource(getClientIdSource());
      setRoute(getActiveRouteLabel());
    } catch (err) {
      if (err instanceof ClientIdUnavailableError) toast('Could not detect a client_id. Paste one below.');
      else toast(err instanceof Error ? err.message : 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  };

  const resetConnection = () => {
    removeKey('client_id_cache');
    removeKey('api_route');
    toast('Connection state cleared — the bridge and routes will be re-probed on the next request. Your likes and playlists are untouched.');
    setSource(getClientIdSource());
    setRoute(getActiveRouteLabel());
  };

  const toggleCache = (on: boolean) => {
    setAudioCacheEnabled(on);
    setCacheOn(on);
    toast(on ? 'Audio cache on — played tracks stay in this browser.' : 'Audio cache off — nothing new is stored.');
  };

  const clearCache = async () => {
    setClearingCache(true);
    try {
      await clearAudioCache();
      toast('Cached audio cleared.');
    } finally {
      setClearingCache(false);
      refreshPlaybackInfo();
    }
  };

  const saveDownloadApi = () => {
    setDownloadApi(downloadApi);
    toast(
      downloadApi.trim()
        ? 'Download API saved — it is tried whenever SoundCloud sources fail.'
        : 'Download API removed.',
    );
  };

  const forgetSources = () => {
    forgetSourceMemory();
    setSourceMemory(getSourceMemory());
    toast('Source memory cleared — the chain starts from the best SoundCloud format again.');
  };

  const cacheSupported = audioCacheSupported();
  const sourceLabelText =
    sourceMemory && sourceMemory.stats.length > 0
      ? sourceMemory.stats
          .slice(0, 3)
          .map((s) => `${s.key} ${s.ok} ok${s.fail ? ` / ${s.fail} failed` : ''}`)
          .join(' · ')
      : 'Learning — play a track';

  const themeOptions: { id: ThemePref; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];

  const sourceLabel =
    source === 'server' ? 'Built-in bridge (no setup needed)' : source === 'custom' ? 'Custom (yours)' : source === 'scrape' ? 'Auto-detected from soundcloud.com' : source === 'cache' ? 'Auto-detected (cached)' : 'Not needed — handled by the bridge';


  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="modal-body">
          {/* ---- SoundCloud connection ---- */}
          <section className="modal-section">
            <h3>SoundCloud connection</h3>
            <p className="modal-status">
              <span className="status-label">client_id</span> {sourceLabel}
            </p>
            <p className="modal-status">
              <span className="status-label">route</span> {route}
            </p>
            <p className="modal-help">
              On Cloudflare Pages, JACos talks to SoundCloud through a tiny built-in server bridge —
              no buttons to press, nothing to paste. If the static build is hosted somewhere without
              that bridge, JACos falls back to a route chain: your custom proxy (if set) &rarr; direct &rarr;
              corsproxy.io &rarr; api.cors.lol &rarr; api.allorigins.win. The one that answers first is
              <strong> remembered</strong>; if it stops working, JACos falls back automatically.
            </p>
            <button className="btn btn-ghost btn-sm" onClick={resetConnection} style={{ marginBottom: 4 }}>
              Reset connection (fixes a stuck state)
            </button>
            <p className="modal-help" style={{ marginTop: 10 }}>
              SoundCloud has no public API keys, so JACos detects the same client_id the web player uses.
              Detection normally just works. If it doesn&rsquo;t (or expires), open soundcloud.com in a tab,
              watch any api-v2 request in DevTools → Network and copy the <code>client_id</code> query parameter.
            </p>
            <label className="field-label" htmlFor="client-id-input">Custom client_id (optional)</label>
            <div className="field-row">
              <input
                id="client-id-input"
                className="text-input mono"
                placeholder="32-character client_id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button className="btn btn-orange-solid btn-sm" onClick={saveClientId}>Save</button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => void testConnection()} disabled={testing} style={{ marginTop: 10 }}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>

            <label className="field-label" htmlFor="proxy-input" style={{ marginTop: 18 }}>Custom CORS proxy (advanced)</label>
            <p className="modal-help">Optional. Tried before everything else. Requests are sent as <code>PROXY?url=&lt;encoded&gt;</code>. If your proxy stops working, JACos falls back to the chain automatically. Leave empty to use the automatic chain.</p>
            <div className="field-row">
              <input
                id="proxy-input"
                className="text-input mono"
                placeholder="https://your-cors-proxy.example/?url="
                value={proxy}
                onChange={(e) => setProxy(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button className="btn btn-orange-solid btn-sm" onClick={saveProxy}>Save</button>
            </div>
          </section>

          {/* ---- Playback & cache ---- */}
          <section className="modal-section">
            <h3>Playback &amp; cache</h3>
            <p className="modal-help">
              Every track is tried against several sources in order: the cached copy first, then each SoundCloud
              format, then your own download API if you set one. The first source that actually plays is remembered
              — for that track and for the next ones — and its audio is downloaded in the background and kept in
              this browser, so a track that worked once keeps working.
            </p>
            <p className="modal-status">
              <span className="status-label">cache</span>{' '}
              {!cacheSupported
                ? 'Not supported in this browser'
                : cacheStats
                  ? `${cacheStats.count} track${cacheStats.count === 1 ? '' : 's'} · ${formatBytes(cacheStats.bytes)} of ${formatBytes(cacheStats.maxBytes)}`
                  : 'Checking…'}
            </p>
            <p className="modal-status">
              <span className="status-label">sources</span> {sourceLabelText}
            </p>
            <div className="theme-picker" role="group" aria-label="Audio cache">
              <button
                className={`theme-option${cacheOn ? ' is-active' : ''}`}
                onClick={() => toggleCache(true)}
                aria-pressed={cacheOn}
                disabled={!cacheSupported}
              >
                Cache on
              </button>
              <button
                className={`theme-option${!cacheOn ? ' is-active' : ''}`}
                onClick={() => toggleCache(false)}
                aria-pressed={!cacheOn}
                disabled={!cacheSupported}
              >
                Cache off
              </button>
            </div>
            <div className="field-row" style={{ marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => void clearCache()} disabled={clearingCache || !cacheSupported}>
                {clearingCache ? 'Clearing…' : 'Clear cached audio'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={forgetSources}>
                Forget source memory
              </button>
            </div>

            <label className="field-label" htmlFor="download-api-input" style={{ marginTop: 18 }}>
              Download API (optional)
            </label>
            <p className="modal-help">
              Your own resolver/downloader endpoint, tried when SoundCloud&rsquo;s own formats won&rsquo;t play.
              It is called as <code>GET &lt;endpoint&gt;?url=&lt;track URL&gt;</code> (or put <code>&#123;url&#125;</code> in the
              endpoint as a placeholder) and should answer JSON with <code>downloadUrl</code> — or <code>url</code> /
              <code>audio</code> — for example <code>&#123;"status": true, "downloadUrl": "https://…/track.mp3"&#125;</code>.
            </p>
            <div className="field-row">
              <input
                id="download-api-input"
                className="text-input mono"
                placeholder="https://your-api.example/getTrackInfo"
                value={downloadApi}
                onChange={(e) => setDownloadApiState(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button className="btn btn-orange-solid btn-sm" onClick={saveDownloadApi}>
                Save
              </button>
            </div>
          </section>

          {/* ---- Appearance ---- */}
          <section className="modal-section">
            <h3>Appearance</h3>
            <p className="modal-help">Choose how JACo&rsquo;s looks. “System” follows your OS setting.</p>
            <div className="theme-picker" role="group" aria-label="Theme">
              {themeOptions.map((o) => (
                <button
                  key={o.id}
                  className={`theme-option${themePref === o.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setThemePref(o.id);
                    setThemePrefState(o.id);
                  }}
                  aria-pressed={themePref === o.id}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </section>

          {/* ---- About ---- */}
          <section className="modal-section">
            <h3>About</h3>
            <p className="modal-help" style={{ marginBottom: 12 }}>
              JACo&rsquo;s Soundcloud v{version} — open source (MIT), made by Buffer. Not affiliated with SoundCloud AB.
            </p>
            <a className="btn btn-dark btn-sm" href={GITHUB_URL} target="_blank" rel="noreferrer">
              <GitHubMark size={15} /> View on GitHub
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}
