import { createApp } from "vue";
import { router } from "./router";
import App from "./App.vue";
import { initTheme } from "./lib/theme";
import { registerOffline } from "./lib/offline";
import { listenForInstall } from "./lib/install";
import "./styles/main.css";

initTheme();
listenForInstall(); // early, so Chrome's install prompt isn't missed
createApp(App).use(router).mount("#app");
registerOffline();
