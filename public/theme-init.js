// Sets the app theme before the first paint, so Midnight (or Dark) never flashes light on a reload (F54).
// The same rules as src/lib/theme.js; test/theme.mjs runs both and checks they agree. A plain file, because the
// content security policy allows no inline script.
(function () {
  try {
    var s = localStorage, p = s.getItem("lanyard-theme") || "auto";
    var k = s.getItem("lanyard-dark") === "midnight" ? "midnight" : "dark";
    var t = p === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? k : "light") : p;
    t = t === "midnight" ? "midnight" : t === "dark" ? "night" : "light";
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]').setAttribute("content", t === "midnight" ? "#000000" : t === "night" ? "#141311" : "#F4F1EA");
  } catch (e) { /* the app sets it when it starts */ }
})();
