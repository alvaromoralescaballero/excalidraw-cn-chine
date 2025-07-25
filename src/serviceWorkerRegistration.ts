// Este código opcional se usa para registrar un service worker.
// register() no se llama por defecto.
// Esto permite que la app cargue más rápido en visitas subsecuentes en producción, y le da
// capacidades offline. Sin embargo, también significa que los desarrolladores (y usuarios)
// solo verán actualizaciones desplegadas en visitas posteriores a una página, después de que todas las
// pestañas abiertas en la página hayan sido cerradas, ya que los recursos previamente en caché
// se actualizan en segundo plano.
// Para aprender más sobre los beneficios de este modelo e instrucciones de cómo
// optar, lee https://bit.ly/CRA-PWA
// [::1] es la dirección localhost IPv6.
// 127.0.0.0/8 se considera localhost para IPv4.
// El constructor URL está disponible en todos los navegadores que soportan SW.
// Nuestro service worker no funcionará si PUBLIC_URL está en un origen diferente
// de donde se sirve nuestra página. Esto puede pasar si se usa un CDN para
// servir los recursos; ver https://github.com/facebook/create-react-app/issues/2374
// Esto se está ejecutando en localhost. Verifiquemos si un service worker aún existe o no.
// Agrega algo de logging adicional en localhost, apuntando a los desarrolladores a la
// documentación de service worker/PWA.
// ¿No es localhost? Solo registra el service worker
// En este punto, el contenido precacheado actualizado ya ha sido obtenido,
// pero el service worker anterior aún servirá el contenido viejo
// hasta que todas las pestañas del cliente sean cerradas.
// Ejecutar callback
// En este punto, todo ha sido precacheado.
// Es el momento perfecto para mostrar un mensaje de
// "El contenido está en caché para uso offline."
// Ejecutar callback
// Verifica si se puede encontrar el service worker. Si no, recarga la página.
// Asegúrate de que el service worker existe, y que realmente estamos obteniendo un archivo JS.
// No se encontró service worker. Probablemente es otra app. Recarga la página.
// Service worker encontrado. Procede normalmente.

const isLocalhost = Boolean(
  window.location.hostname === "localhost" ||
    // [::1] es la dirección localhost IPv6.
    window.location.hostname === "[::1]" ||
    // 127.0.0.0/8 se considera localhost para IPv4.
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/,
    ),
);

type Config = {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
};

export const register = (config?: Config) => {
  if (
    (process.env.NODE_ENV === "production" ||
      process.env.REACT_APP_DEV_ENABLE_SW?.toLowerCase() === "true") &&
    "serviceWorker" in navigator
  ) {
    // El constructor URL está disponible en todos los navegadores que soportan SW.
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      // Nuestro service worker no funcionará si PUBLIC_URL está en un origen diferente
      // de donde se sirve nuestra página. Esto puede pasar si se usa un CDN para
      // servir los recursos; ver https://github.com/facebook/create-react-app/issues/2374
      return;
    }

    window.addEventListener("load", () => {
      const isWebexLP = window.location.pathname.startsWith("/webex");
      if (isWebexLP) {
        unregister(() => {
          window.location.reload();
        });
        return false;
      }
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      if (isLocalhost) {
        // Esto se está ejecutando en localhost. Verifiquemos si un service worker aún existe o no.
        checkValidServiceWorker(swUrl, config);

        // Agrega algo de logging adicional en localhost, apuntando a los desarrolladores a la
        // documentación de service worker/PWA.
        navigator.serviceWorker.ready.then(() => {
          console.info(
            "Esta aplicación web está siendo servida por un service worker en caché. Para aprender más, visita https://bit.ly/CRA-PWA",
          );
        });
      } else {
        // ¿No es localhost? Solo registra el service worker
        registerValidSW(swUrl, config);
      }
    });
  }
};

const registerValidSW = (swUrl: string, config?: Config) => {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === "installed") {
            if (navigator.serviceWorker.controller) {
              // En este punto, el contenido precacheado actualizado ya ha sido obtenido,
              // pero el service worker anterior aún servirá el contenido viejo
              // hasta que todas las pestañas del cliente sean cerradas.

              console.info(
                "El contenido está disponible y se usará cuando todas las pestañas de esta página estén cerradas.",
              );

              // Ejecutar callback
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              // En este punto, todo ha sido precacheado.
              // Es el momento perfecto para mostrar un mensaje de
              // "El contenido está en caché para uso offline."

              console.info("El contenido está en caché para uso offline.");

              // Ejecutar callback
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error("Error durante el registro del service worker:", error);
    });
};

const checkValidServiceWorker = (swUrl: string, config?: Config) => {
  // Verifica si se puede encontrar el service worker. Si no, recarga la página.
  fetch(swUrl, {
    headers: { "Service-Worker": "script" },
  })
    .then((response) => {
      // Asegúrate de que el service worker existe, y que realmente estamos obteniendo un archivo JS.
      const contentType = response.headers.get("content-type");
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf("javascript") === -1)
      ) {
        // No se encontró service worker. Probablemente es otra app. Recarga la página.
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        // Service worker encontrado. Procede normalmente.
        registerValidSW(swUrl, config);
      }
    })
    .catch((error) => {
      console.info(
        "No se encontró conexión a internet. La aplicación está en modo offline.",
        error.message,
      );
    });
};

export const unregister = (callback?: () => void) => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        return registration.unregister();
      })
      .then(() => {
        callback?.();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
};
