import { createRouter, createWebHistory } from "vue-router";
import Landing from "../views/Landing.vue";
import Onboard from "../views/Onboard.vue";
import Profile from "../views/Profile.vue";
import MyQR from "../views/MyQR.vue";
import Scan from "../views/Scan.vue";
import Login from "../views/Login.vue";
import Connections from "../views/Connections.vue";

const routes = [
  { path: "/", component: Landing },
  { path: "/onboard", component: Onboard },
  { path: "/p/:id", component: Profile },
  { path: "/qr", component: MyQR },
  { path: "/scan", component: Scan },
  { path: "/login", component: Login },
  { path: "/swap", redirect: "/scan" },
  { path: "/connections", component: Connections },
  { path: "/followup", redirect: "/connections" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
