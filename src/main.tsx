import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const checkForUpdates = () => {
      if (navigator.onLine) {
        void registration.update();
      }
    };

    window.setInterval(checkForUpdates, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    });
    window.addEventListener('online', checkForUpdates);
  },
  onNeedRefresh() {
    void updateSW(true);
  },
});

createRoot(document.getElementById('root')!).render(<App />);
