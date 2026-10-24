import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fraunces/latin-500.css';
import '@fontsource/fraunces/latin-700.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
import './styles.css';
import App from './App';
import { CrashScreen } from './components/CrashScreen';

createRoot(document.getElementById('root')!).render(<StrictMode><CrashScreen><App /></CrashScreen></StrictMode>);

// Offline support for the installed Home Screen app.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js'); });
}
