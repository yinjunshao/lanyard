// F66 (D061): getting a company logo ready to send, in the host's browser (host pages only; no public page imports it).
// PNG, JPEG or WebP only (the Worker checks the bytes again and refuses anything else, SVG included). A picture over
// 1024 px on its longest side is drawn smaller on a canvas and sent as a PNG, so a transparent logo stays transparent;
// one that is small enough is sent as it is, so it is not made blurrier. Over 1 MB after that is refused here, as there.
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const LOGO_MAX_SIDE = 1024;
export const LOGO_MAX_BYTES = 1024 * 1024;

export const LOGO_TYPE_ERROR = "Use a PNG, JPEG or WebP picture for the logo. Other files, SVG included, can't be used.";
export const LOGO_SIZE_ERROR = "That logo is over 1 MB. Choose a smaller file.";

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error("That file could not be read. Try another."));
  r.readAsDataURL(blob);
});
// The bytes a data URL holds (about three quarters of its base64).
export const dataUrlBytes = (u) => Math.floor((String(u).split(",")[1] || "").replace(/=+$/, "").length * 0.75);

// The longest side of a picture made `side` long at most, keeping its shape.
export function fitWithin(w, h, side = LOGO_MAX_SIDE) {
  const k = Math.min(1, side / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** A data URL to send, or throws an Error with words for the host. */
export async function prepareLogo(file) {
  if (!file || !LOGO_TYPES.includes(file.type)) throw new Error(LOGO_TYPE_ERROR);
  const original = await readAsDataUrl(file);
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error(LOGO_TYPE_ERROR)); img.src = original; });
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) throw new Error(LOGO_TYPE_ERROR);
  if (Math.max(w, h) <= LOGO_MAX_SIDE && file.size <= LOGO_MAX_BYTES) return original;
  const size = fitWithin(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = size.w; canvas.height = size.h;
  canvas.getContext("2d").drawImage(img, 0, 0, size.w, size.h);
  let out = canvas.toDataURL("image/png");
  if (dataUrlBytes(out) > LOGO_MAX_BYTES) out = canvas.toDataURL("image/webp", 0.9);
  if (!/^data:image\/(png|webp);/.test(out) || dataUrlBytes(out) > LOGO_MAX_BYTES) throw new Error(LOGO_SIZE_ERROR);
  return out;
}
