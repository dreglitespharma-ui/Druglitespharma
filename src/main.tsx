import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global suppression for camera lifecycle aborts from html5-qrcode
window.addEventListener('error', (event) => {
  const msg = event?.message || (typeof event?.error === 'string' ? event.error : event?.error?.message) || '';
  if (
    typeof msg === 'string' &&
    (msg.includes('RenderedCameraImpl') ||
     msg.includes('video surface onabort') ||
     msg.includes('video surface onerror') ||
     msg.includes('The RenderedCamera has already been closed'))
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }
}, true);

window.addEventListener('unhandledrejection', (event) => {
  const msg = event?.reason?.message || String(event?.reason || '');
  if (
    msg.includes('play() request was interrupted') ||
    msg.includes('media was removed from the document') ||
    msg.includes('RenderedCameraImpl') ||
    msg.includes('video surface onabort') ||
    msg.includes('The RenderedCamera has already been closed') ||
    event?.reason?.name === 'AbortError'
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
});

createRoot(document.getElementById('root')!).render(<App />);
