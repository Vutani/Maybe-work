/// <reference path="./plugin.d.ts" />
/// <reference path="./app.d.ts" />
/// <reference path="./core.d.ts" />

// Rule34 Browser - Seanime plugin
// Minor-related content is ALWAYS filtered out (query + client-side).

function init() {
    $ui.register((ctx) => {
        const API = "https://api.rule34.xxx/index.php"
        const PAGE_SIZE = 20

        // Always excluded. Not user-configurable.
        const BLACKLIST = [
            "loli", "shota", "child", "toddler", "cub", "underage",
            "young", "minor", "baby", "infant", "lolicon", "shotacon",
            "child_porn", "pedophilia", "preteen", "teenager", "toddlercon",
        ]

        const tray = ctx.newTray({
            tooltipText: "Rule34 Browser",
            iconUrl: "https://rule34.xxx/favicon.ico",
            withContent: true,
        })

        // ---------- state ----------
        const posts = ctx.state([])
        const page = ctx.state(0)
        const loading = ctx.state(false)
        const error = ctx.state("")
        const selected = ctx.state(null)
        const lastTags = ctx.state("")
        const lastRating = ctx.state("any")

        const tagsRef = ctx.fieldRef("")
        const ratingRef = ctx.fieldRef("any")

        // ---------- helpers ----------
        function pref(name, fallback) {
            try {
                const v = $getUserPreference(name)
                return v === undefined || v === null || v === "" ? fallback : v
            } catch (e) {
                return fallback
            }
        }

        function img(url) {
            if (!url) return ""
            if (String(pref("useProxy", "true")) === "false") return url
            const base = String(pref("serverUrl", "http://127.0.0.1:43211")).replace(/\/$/, "")
            return `${base}/api/v1/image-proxy?url=${encodeURIComponent(url)}`
        }

        function isBlocked(post) {
            const tags = String(post.tags || "").toLowerCase().split(/\s+/)
            return tags.some((t) => BLACKLIST.indexOf(t) !== -1)
        }

        function buildTags(userTags, rating) {
            const parts = String(userTags || "")
                .split(/\s+/)
                .filter((t) => t && !t.startsWith("-") && BLACKLIST.indexOf(t.toLowerCase()) === -1)
            if (rating && rating !== "any") parts.push(`rating:${rating}`)
            BLACKLIST.forEach((t) => parts.push(`-${t}`))
            return parts.join(" ")
        }

        async function load(pageNum) {
            const apiKey = pref("apiKey", "")
            const userId = pref("userId", "")
            loading.set(true)
            error.set("")
            try {
                const params = [
                    "page=dapi", "s=post", "q=index", "json=1",
                    `limit=${PAGE_SIZE}`,
                    `pid=${pageNum}`,
                    `tags=${encodeURIComponent(buildTags(lastTags.get(), lastRating.get()))}`,
                ]
                if (apiKey && userId) {
                    params.push(`api_key=${encodeURIComponent(apiKey)}`)
                    params.push(`user_id=${encodeURIComponent(userId)}`)
                }
               const res = await ctx.fetch(`${API}?${params.join("&")}`)
const text = res.text()
const status = res.status
let data = []
try {
    data = text ? JSON.parse(text) : []
} catch (e) {
    throw new Error(`HTTP ${status}, not JSON: ${text ? text.slice(0, 300) : "(empty)"}`)
}
if (!Array.isArray(data)) {
    throw new Error(`HTTP ${status}, unexpected: ${text.slice(0, 300)}`)
}
const filtered = data.filter((p) => !isBlocked(p))
if (filtered.length === 0) {
    throw new Error(`No results. HTTP ${status}. Raw ${data.length} posts, ${data.length - filtered.length} filtered. Body: ${text.slice(0, 200)}`)
}
posts.set(filtered)
page.set(pageNum)
            } catch (e) {
                error.set(String(e && e.message ? e.message : e))
                posts.set([])
            } finally {
                loading.set(false)
            }
        }

        // ---------- events ----------
        ctx.registerEventHandler("r34-search", () => {
            lastTags.set(tagsRef.current || "")
            lastRating.set(ratingRef.current || "any")
            selected.set(null)
            load(0)
        })
        ctx.registerEventHandler("r34-prev", () => {
            if (page.get() > 0) load(page.get() - 1)
        })
        ctx.registerEventHandler("r34-next", () => load(page.get() + 1))
        ctx.registerEventHandler("r34-back", () => selected.set(null))

        tray.onOpen(() => {
            if (posts.get().length === 0 && !loading.get()) load(0)
        })

        // ---------- views ----------
        function detailView(p) {
            const full = p.sample_url || p.file_url
            const isVideo = /\.(mp4|webm)$/i.test(p.file_url || "")
            const tagList = String(p.tags || "").trim().split(/\s+/).slice(0, 40).join(" ")
            return tray.stack([
                tray.button({ label: "← Back", size: "sm", onClick: "r34-back" }),
                isVideo
                    ? tray.text("Video post: open the original link below.")
                    : tray.img({ src: img(full), style: { maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" } }),
                tray.text(`#${p.id}  •  rating: ${p.rating}  •  score: ${p.score ?? "-"}`, { style: { fontSize: "12px", opacity: 0.8 } }),
                tray.anchor("Open original", { href: p.file_url, target: "_blank" }),
                tray.anchor("Open post page", { href: `https://rule34.xxx/index.php?page=post&s=view&id=${p.id}`, target: "_blank" }),
                tray.text(tagList, { style: { fontSize: "11px", opacity: 0.7, wordBreak: "break-word" } }),
            ], { gap: 2 })
        }

        function gridView() {
            const items = posts.get().map((p) =>
                tray.stack([
                    tray.img({
                        src: img(p.preview_url || p.sample_url),
                        style: { width: "120px", height: "120px", objectFit: "cover", borderRadius: "6px" },
                    }),
                    tray.button({
                        label: "View",
                        size: "sm",
                        onClick: ctx.eventHandler(`r34-view-${p.id}`, () => selected.set(p)),
                    }),
                ], { gap: 1 })
            )
            return tray.div(items, { style: { display: "flex", flexWrap: "wrap", gap: "10px" } })
        }

        tray.render(() => {
            const sel = selected.get()
            if (sel) return detailView(sel)

            const hasKey = !!(pref("apiKey", "") && pref("userId", ""))
            return tray.stack([
                tray.input("Tags (space separated)", { fieldRef: tagsRef }),
                tray.select("Rating", {
                    fieldRef: ratingRef,
                    options: [
                        { label: "Any", value: "any" },
                        { label: "Safe", value: "safe" },
                        { label: "Questionable", value: "questionable" },
                        { label: "Explicit", value: "explicit" },
                    ],
                }),
                tray.button({ label: "Search", intent: "primary", onClick: "r34-search" }),
                !hasKey
                    ? tray.text("No API key/user ID set. Rule34's API may reject requests without them (see extension settings).", { style: { fontSize: "11px", opacity: 0.7 } })
                    : tray.text(""),
                loading.get() ? tray.text("Loading...") : tray.text(""),
                error.get() ? tray.text(`Error: ${error.get()}`, { style: { color: "#f87171" } }) : tray.text(""),
                gridView(),
                tray.flex([
                    tray.button({ label: "Prev", size: "sm", onClick: "r34-prev", disabled: page.get() === 0 }),
                    tray.text(`Page ${page.get() + 1}`),
                    tray.button({ label: "Next", size: "sm", onClick: "r34-next" }),
                ], { gap: 2, style: { alignItems: "center", justifyContent: "center" } }),
            ], { gap: 2 })
        })
    })
}
