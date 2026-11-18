// Motion for the dialogs that are drawn as `.sheet-backdrop` > `.sheet` (the connect sheet, the follow-up composer,
// "Do I know someone who...", and the photo cropper's `.crop-backdrop`) (F40). Their parent shows them with a v-if
// and takes them out when they emit "close", so they cannot slide out by themselves. Instead they ask to close
// here: the layer gets `.is-leaving` (the CSS slides or fades it out, and it takes no clicks meanwhile), and
// only when that is over does the component emit "close". The parent then unmounts it, which is when each one
// lets go of the page's scroll lock and gives focus back. On a phone a sheet can also be swiped down.
//
// Loaded by lazy chunks only (the connect sheet is fetched by the card page with a plain import()), so it is in
// no public page's first load. D045.
import { onBeforeUnmount, onMounted, ref } from "vue";

// A little longer than the longest exit (--dur-sheet-out, 200 ms); the CSS decides how fast it really goes.
export const EXIT_MS = 220;

// Starts the swipe on the panel in `root` (a ref, or null for a dialog that does not swipe). A plain dynamic import, so
// the swipe stays its own small chunk with nothing behind it (UiSheet loads it the same way). Resolves to the function
// that stops it, or null.
export const attachSwipe = (root, close) =>
  root?.value ? import("./sheetSwipe.js").then((m) => m.swipeClose(root.value, close)) : Promise.resolve(null);

// emit: the component's emit; root: a ref to the panel to swipe down (the .sheet element; null for a dialog that
// does not swipe, like the photo cropper). close() emits
// `event` ("close") when the exit is over; close("done", value) emits another one, with its argument.
export function useSheetExit(emit, root, event = "close") {
  const leaving = ref(false);
  let timer = 0;
  let off = null;
  function close(name = event, ...args) {
    if (leaving.value) return;
    leaving.value = true;
    off?.(true);
    off = null;
    timer = setTimeout(() => emit(name, ...args), EXIT_MS);
  }
  onMounted(() => {
    attachSwipe(root, close).then((stop) => { if (leaving.value) stop?.(true); else off = stop; });
  });
  onBeforeUnmount(() => { clearTimeout(timer); off?.(); });
  return { leaving, close };
}
