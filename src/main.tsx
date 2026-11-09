import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App';

// Link-style URLs (jac-os.pages.dev/bfrend, /bfrend/sets/x) get one boot-time
// hop to the #/resolve route, which points them at the right page. Static
// assets and files are untouched.
const bootPath = window.location.pathname;
if (bootPath !== '/' && window.location.hash === '') {
  const segs = bootPath.split('/').filter(Boolean);
  const last = segs[segs.length - 1] ?? '';
  const looksLikeFile = /\.[A-Za-z0-9]{1,8}$/.test(last);
  const isAssetDir = segs[0] === 'assets' || segs[0] === 'static';
  if (!looksLikeFile && !isAssetDir) {
    window.location.replace(`/#/resolve/${segs.map(encodeURIComponent).join('/')}`);
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
