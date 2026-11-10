import { shallowRef } from "vue";

// The signed-in page frame (top bar, account banner, tab bar, Terms pop-up) is a chunk of its
// own, so the landing page, a scanned card and the other public pages do not download it (F28,
// D024). The router waits for it before it opens an /app page, so the frame is never missing.
export const shell = shallowRef(null);
let loading = null;
export function loadShell() {
  if (!loading) {
    loading = import("../components/AppShell.vue").then((m) => { shell.value = m.default; });
    loading.catch(() => { loading = null; }); // a failed download can be tried again
  }
  return loading;
}
