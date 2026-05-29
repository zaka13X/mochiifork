"use strict";

(() => {
    const Ultraviolet = self.Ultraviolet;
    const config = self.__uv$config;

    const HEADERS_TO_REMOVE = [
        "cross-origin-embedder-policy",
        "cross-origin-opener-policy",
        "cross-origin-resource-policy",
        "content-security-policy",
        "content-security-policy-report-only",
        "expect-ct",
        "feature-policy",
        "origin-isolation",
        "strict-transport-security",
        "upgrade-insecure-requests",
        "x-content-type-options",
        "x-download-options",
        "x-frame-options",
        "x-permitted-cross-domain-policies",
        "x-powered-by",
        "x-xss-protection"
    ];

    const BYPASS_LIST = [
        "challenges.cloudflare.com",
        "hcaptcha.com",
        "google.com/recaptcha",
        "www.google.com/recaptcha"
    ];

    function isBypassURL(url) {
        return BYPASS_LIST.some(domain => url.includes(domain));
    }

    const ALLOWED_METHODS = ["GET", "HEAD"];

    class UVServiceWorker extends Ultraviolet.EventEmitter {
        constructor(cfg = config) {
            super();
            this.config = cfg;
            this.bareClient = new Ultraviolet.BareClient();
        }

        route({ request }) {
            return request.url.startsWith(location.origin + this.config.prefix);
        }

        async fetch({ request }) {
            const url = request.url;

            // 🚨 bypass protection endpoints directly
            if (isBypassURL(url)) {
                return fetch(request);
            }

            let uv;
            let finalURL;

            try {
                if (!url.startsWith(location.origin + this.config.prefix)) {
                    return fetch(request);
                }

                uv = new Ultraviolet(this.config);
                typeof this.config.construct === "function" &&
                    this.config.construct(uv, "service");

                const cookieJar = await uv.cookie.db();

                uv.meta.origin = location.origin;
                uv.meta.base = uv.meta.url = new URL(uv.sourceUrl(url));

                const req = new RequestWrapper(
                    request,
                    uv,
                    ALLOWED_METHODS.includes(request.method.toUpperCase())
                        ? null
                        : await request.blob()
                );

                if (uv.meta.url.protocol === "blob:") {
                    req.blob = true;
                    req.base = req.url = new URL(req.url.pathname);
                }

                // headers
                if (request.referrer?.startsWith(location.origin)) {
                    const ref = new URL(uv.sourceUrl(request.referrer));

                    if (
                        req.headers.origin ||
                        (uv.meta.url.origin !== ref.origin && request.mode === "cors")
                    ) {
                        req.headers.origin = ref.origin;
                    }

                    req.headers.referer = ref.href;
                }

                const cookies = (await uv.cookie.getCookies(cookieJar)) || [];
                const cookieHeader = uv.cookie.serialize(cookies, uv.meta, false);

                req.headers["user-agent"] = navigator.userAgent;
                if (cookieHeader) req.headers.cookie = cookieHeader;

                const hookReq = new HookRequest(req);

                this.emit("request", hookReq);
                if (hookReq.intercepted) return hookReq.returnValue;

                finalURL = req.blob
                    ? "blob:" + location.origin + req.url.pathname
                    : req.url;

                const res = await this.bareClient.fetch(finalURL, {
                    headers: req.headers,
                    method: req.method,
                    body: req.body,
                    credentials: req.credentials,
                    mode: req.mode,
                    cache: req.cache,
                    redirect: req.redirect
                });

                const wrapped = new ResponseWrapper(req, res);

                const hookRes = new HookRequest(wrapped);

                this.emit("beforemod", hookRes);
                if (hookRes.intercepted) return hookRes.returnValue;

                // strip unsafe headers
                for (const h of HEADERS_TO_REMOVE) {
                    delete wrapped.headers[h];
                }

                if (wrapped.headers.location) {
                    wrapped.headers.location = uv.rewriteUrl(
                        wrapped.headers.location
                    );
                }

                const dest = request.destination;

                if (["document", "iframe"].includes(dest)) {
                    const cd = wrapped.getHeader("content-disposition");

                    if (!/filename=/i.test(cd || "")) {
                        const mode = /^attachment/i.test(cd)
                            ? "attachment"
                            : "inline";

                        const name = new URL(res.finalURL).pathname.split("/").pop();

                        wrapped.headers["content-disposition"] =
                            `${mode}; filename="${name}"`;
                    }
                }

                if (wrapped.body) {
                    switch (dest) {
                        case "script":
                            wrapped.body = uv.js.rewrite(await res.text());
                            break;

                        case "style":
                            wrapped.body = uv.rewriteCSS(await res.text());
                            break;

                        case "iframe":
                        case "document":
                            if (
                                wrapped.getHeader("content-type")?.startsWith(
                                    "text/html"
                                )
                            ) {
                                const html = await res.text();

                                wrapped.body = uv.rewriteHtml(html, {
                                    document: true,
                                    injectHead: uv.createHtmlInject(
                                        uv.handlerScript,
                                        uv.bundleScript,
                                        uv.clientScript,
                                        uv.configScript,
                                        uv.cookie.serialize(
                                            cookies,
                                            uv.meta,
                                            true
                                        ),
                                        request.referrer
                                    )
                                });
                            }
                            break;
                    }
                }

                if (request.mode === "cors") {
                    wrapped.headers["Cross-Origin-Embedder-Policy"] =
                        "require-corp";
                }

                this.emit("response", hookRes);

                return hookRes.intercepted
                    ? hookRes.returnValue
                    : new Response(wrapped.body, {
                          status: wrapped.status,
                          statusText: wrapped.statusText,
                          headers: wrapped.headers
                      });
            } catch (err) {
                console.error(err);

                if (
                    request.destination === "document" ||
                    request.destination === "iframe"
                ) {
                    return new Response(
                        `<h1>UV Error</h1><pre>${err}</pre>`,
                        { status: 500 }
                    );
                }

                return new Response(null, { status: 500 });
            }
        }

        static Ultraviolet = Ultraviolet;
    }

    self.UVServiceWorker = UVServiceWorker;

    // wrappers (kept minimal but functional)
    class ResponseWrapper {
        constructor(req, res) {
            this.request = req;
            this.raw = res;
            this.headers = {};

            for (const k in res.rawHeaders) {
                this.headers[k.toLowerCase()] = res.rawHeaders[k];
            }

            this.status = res.status;
            this.statusText = res.statusText;
            this.body = res.body;
        }

        getHeader(h) {
            const v = this.headers[h];
            return Array.isArray(v) ? v[0] : v;
        }
    }

    class RequestWrapper {
        constructor(req, uv, body = null) {
            this.ultraviolet = uv;
            this.method = req.method;
            this.headers = Object.fromEntries(req.headers.entries());
            this.body = body;

            this.cache = req.cache;
            this.redirect = req.redirect;
            this.credentials = "omit";
            this.mode = req.mode === "cors" ? req.mode : "same-origin";

            this.blob = false;
            this.url = uv.meta.url;
        }
    }

    class HookRequest {
        constructor(data) {
            this.data = data;
            this._intercepted = false;
            this._returnValue = null;
        }

        get intercepted() {
            return this._intercepted;
        }

        get returnValue() {
            return this._returnValue;
        }

        respondWith(v) {
            this._returnValue = v;
            this._intercepted = true;
        }
    }
})();