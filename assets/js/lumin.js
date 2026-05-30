(function () {
  const LUMIN_SDK_SRC =
    "https://cdn.jsdelivr.net/gh/luminsdk/script@latest/lumin.min.js";

  let sdkPromise = null;

  function resolveContainer(container) {
    if (typeof container === "string") {
      return document.querySelector(container);
    }

    return container;
  }

  function getFreshContainer(container) {
    const target = resolveContainer(container);

    if (!target) {
      throw new Error("LuminSDK container was not found.");
    }

    if (target.dataset.mochiiLuminMounted === "true" || target.shadowRoot) {
      const freshTarget = target.cloneNode(false);
      freshTarget.removeAttribute("data-mochii-lumin-mounted");
      target.replaceWith(freshTarget);
      return freshTarget;
    }

    return target;
  }

  function loadSdk() {
    if (window.Lumin) {
      return Promise.resolve(window.Lumin);
    }

    if (sdkPromise) {
      return sdkPromise;
    }

    sdkPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(
        `script[src="${LUMIN_SDK_SRC}"]`
      );

      const failLoad = (error, script) => {
        sdkPromise = null;
        script?.remove();
        reject(error);
      };

      const finishLoad = (script) => {
        if (window.Lumin) {
          if (script) script.dataset.mochiiLuminLoaded = "true";
          resolve(window.Lumin);
        } else {
          failLoad(
            new Error("LuminSDK loaded, but window.Lumin is missing."),
            script
          );
        }
      };

      if (existingScript) {
        if (existingScript.dataset.mochiiLuminLoaded === "true") {
          finishLoad(existingScript);
          return;
        }

        existingScript.addEventListener("load", () => finishLoad(existingScript), {
          once: true,
        });
        existingScript.addEventListener(
          "error",
          () => failLoad(new Error("Failed to load LuminSDK."), existingScript),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.src = LUMIN_SDK_SRC;
      script.async = true;
      script.onload = () => finishLoad(script);
      script.onerror = () =>
        failLoad(new Error("Failed to load LuminSDK."), script);
      document.head.appendChild(script);
    });

    return sdkPromise;
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(`mochii:lumin:${name}`, { detail }));
  }

  function destroy() {
    if (window.Lumin && typeof window.Lumin.destroy === "function") {
      try {
        window.Lumin.destroy();
        emit("destroy");
      } catch (error) {
        console.warn("LuminSDK destroy failed:", error);
      }
    }
  }

  async function init(container, options) {
    const target = getFreshContainer(container);
    const Lumin = await loadSdk();

    if (!Lumin || typeof Lumin.init !== "function") {
      throw new Error("LuminSDK init method is unavailable.");
    }

    const config = {
      container: target,
      theme: "dark",
      columns: 8,
      rows: 4,
      gamesPerPage: 32,
      showSearch: true,
      showCategories: true,
      showRandom: true,
      ...(options || {}),
    };

    await Lumin.init(config);
    target.dataset.mochiiLuminMounted = "true";
    emit("ready", { container: target });

    return Lumin;
  }

  window.MochiiLumin = {
    init,
    destroy,
    loadSdk,
    source: LUMIN_SDK_SRC,
  };
})();
