type PwaUpdateEvent = CustomEvent<{ worker: ServiceWorker }>;

declare global {
  interface WindowEventMap {
    "pwa-update-available": PwaUpdateEvent;
  }
}

function notifyUpdateAvailable(worker: ServiceWorker) {
  window.dispatchEvent(new CustomEvent("pwa-update-available", { detail: { worker } }));
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) {
    return;
  }

  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.origin);

    navigator.serviceWorker
      .register(serviceWorkerUrl)
      .then((registration) => {
        if (registration.waiting) {
          notifyUpdateAvailable(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;

          if (!newWorker) {
            return;
          }

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              notifyUpdateAvailable(newWorker);
            }
          });
        });
      })
      .catch(() => {
        // La app sigue funcionando aunque el navegador bloquee el service worker.
      });
  });
}
