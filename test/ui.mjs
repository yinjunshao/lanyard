// F05 and F06: source guards for the My card tab icon and the quiet buttons on /app.
// The look is checked in a browser (see the F05 and F06 plan notes); this guards the wiring.
import { readFileSync } from "node:fs";
import { check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

console.log("\n# F05 QR icon for the My card tab");
const icon = read("src/components/Icon.vue");
check("Icon.vue has a qr glyph", /^\s*qr: '/m.test(icon));
const app = read("src/App.vue");
check("the My card tab uses the qr icon", /key: "card", icon: "qr"/.test(app));
check("the tab bar draws t.icon, falling back to t.key", app.includes('<Icon :name="t.icon || t.key" />'));

summary();
