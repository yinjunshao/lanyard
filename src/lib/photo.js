// Browser-side image capture and compression.
// Output: WebP data URL, longest edge <= maxSize (1080 default).
// Falls back to JPEG if WebP encoding is unavailable.

export function fileToDataUrl(file, maxSize = 1080, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        let url = canvas.toDataURL("image/webp", quality);
        if (!url.startsWith("data:image/webp")) {
          url = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(url);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Camera capture on phones, file picker elsewhere. environment lens for QR
// selfies; pass "user" for the avatar camera.
export function pickPhoto(maxSize = 1080, facing = "environment") {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = facing === "user" ? "user" : "environment";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try { resolve(await fileToDataUrl(file, maxSize)); } catch (e) { reject(e); }
    };
    input.click();
  });
}
