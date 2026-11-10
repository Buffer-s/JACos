import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App';
import { applyTheme, getThemePref, watchSystemTheme } from './lib/theme';

// Link-style URLs (jac-os.pages.dev/bfrend, /bfrend/sets/x) get one boot-time
// hop to the #/resolve route, which points them at the right page. Static
// assets and files are untouched.
// Theme: apply before first paint to avoid a flash of the wrong theme.
applyTheme(getThemePref());
watchSystemTheme();

const bootPath = window.location.pathname;
if (bootPath !== '/' && window.location.hash === '') {
  const segs = bootPath.split('/').filter(Boolean);
  const last = segs[segs.length - 1] ?? '';
  const looksLikeFile = /\.[A-Za-z0-9]{1,8}$/.test(last);
  const isAssetDir = segs[0] === 'assets' || segs[0] === 'static';
  // the app owns these first segments — never treat them as public-playlist slugs
  const RESERVED = new Set(['user', 'playlist', 'resolve', 'search', 'likes', 'playlists', 'public', 'api', 'assets', 'static', 'settings']);
  const single = segs.length === 1 && !RESERVED.has(segs[0].toLowerCase());
  if (!looksLikeFile && !isAssetDir) {
    if (single) {
      // could be a public playlist link (jac-os.pages.dev/<slug>); the page itself
      // falls back to the SoundCloud resolver when no public playlist exists
      window.location.replace(`/#/public/${encodeURIComponent(segs[0])}`);
    } else {
      window.location.replace(`/#/resolve/${segs.map(encodeURIComponent).join('/')}`);
    }
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
