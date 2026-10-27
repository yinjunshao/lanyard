import { createApp } from "vue";
import { router } from "./router";
import App from "./App.vue";
import { initTheme } from "./lib/theme";
import "./styles/main.css";

initTheme();
createApp(App).use(router).mount("#app");
