export function registerServiceWorker() {
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // La app sigue funcionando aunque el navegador bloquee el service worker.
      });
    });
  }
}
