import './app.css';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app mount point missing');

const app = new App({ target });

// Register the offline service worker in production builds only, so it never
// interferes with the dev server's hot-module reloading.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

export default app;
