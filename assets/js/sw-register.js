// mochii sw-register.js
// Handles SW registration with retry, wisp health check, and fallback

const WISP_SERVERS = [
    "wss://wisp.mercurywork.shop/",
    "wss://anura.pro/wisp/",
    "wss://rhwhub.com/wisp/"
];

// Try each wisp server and return the first one that responds
async function getBestWisp() {
    const saved = localStorage.getItem("cherri_wispUrl");

    // Test the saved one first if it exists
    const toTest = saved ? [saved, ...WISP_SERVERS.filter(s => s !== saved)] : WISP_SERVERS;

    for (const url of toTest) {
        try {
            const alive = await testWisp(url);
            if (alive) {
                console.log(
                    "%cmochii" + "%c wisp OK: " + url,
                    "color: white; background: linear-gradient(to bottom right, #040c16, #000000); border-radius: 5px; font-weight: bold; padding: 6px; font-family: sans-serif;",
                    "color: white;"
                );
                return url;
            }
        } catch (_) { /* try next */ }
    }

    // All failed — return saved or first as last resort
    console.warn("mochii: all wisp servers failed health check, using fallback");
    return saved || WISP_SERVERS[0];
}

// Returns true if the wisp server opens a WebSocket within 3 seconds
function testWisp(url) {
    return new Promise((resolve) => {
        try {
            const ws = new WebSocket(url);
            const timer = setTimeout(() => {
                ws.close();
                resolve(false);
            }, 3000);
            ws.onopen = () => {
                clearTimeout(timer);
                ws.close();
                resolve(true);
            };
            ws.onerror = () => {
                clearTimeout(timer);
                resolve(false);
            };
        } catch (_) {
            resolve(false);
        }
    });
}

// Register a single SW with retries
async function registerOne(path, label, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const reg = await navigator.serviceWorker.register(path, { scope: "/" });
            await navigator.serviceWorker.ready;
            console.log(
                "%cmochii" + `%c ${label} sw registered (attempt ${attempt})`,
                "color: white; background: linear-gradient(to bottom right, #040c16, #000000); border-radius: 5px; font-weight: bold; padding: 6px; font-family: sans-serif;",
                "color: white;"
            );
            return reg;
        } catch (e) {
            console.warn(`mochii: ${label} sw registration failed (attempt ${attempt}/${maxRetries})`, e);
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 1500 * attempt)); // back off
            }
        }
    }
    throw new Error(`${label} sw failed after ${maxRetries} attempts`);
}

// Main entry point — called on window load
async function registerSW() {
    if (!("serviceWorker" in navigator)) {
        console.warn("mochii: service workers not supported");
        showToast("error", "Service workers not supported in this browser.", "fas fa-times-circle");
        unlockSearch();
        return;
    }

    // Run wisp health check in parallel with SW registration
    const [bestWisp] = await Promise.allSettled([
        getBestWisp(),
        registerOne("/uv/sw.js", "UV")
            .then(() => showToast("success", "Ultraviolet worker initialized!", "fas fa-check-circle"))
            .catch(() => showToast("error", "UV worker failed to register — games may not load.", "fas fa-times-circle")),
        registerOne("/sw.js", "Scramjet")
            .then(() => showToast("success", "Scramjet worker initialized!", "fas fa-check-circle"))
            .catch(() => showToast("error", "Scramjet worker failed to register.", "fas fa-times-circle"))
    ]);

    // Apply the best wisp server if it differs from what's stored
    if (bestWisp.status === "fulfilled") {
        const wisp = bestWisp.value;
        const current = localStorage.getItem("cherri_wispUrl");
        if (wisp !== current) {
            localStorage.setItem("cherri_wispUrl", wisp);
            console.log("mochii: auto-set wisp to", wisp);
        }
    }

    unlockSearch();
}

function unlockSearch() {
    const spinner = document.querySelector(".fa-spinner-third");
    const search = document.querySelector("#homesearch");
    if (spinner) {
        spinner.style.opacity = 0;
        spinner.style.pointerEvents = "none";
    }
    if (search) {
        search.disabled = false;
        search.placeholder = "search anything...";
    }
}
