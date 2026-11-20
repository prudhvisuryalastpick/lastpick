// Shrink a photo to a small JPEG data URL (stored inline with the offer, ~30–120 KB).
export async function compressPhoto(file, maxSide = 900, maxChars = 190000) {
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Couldn't read that photo")); i.src = dataUrl; });
  let side = maxSide, quality = 0.75, out = "";
  for (let i = 0; i < 6; i++) {
    const s = Math.min(1, side / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL("image/jpeg", quality);
    if (out.length <= maxChars) return out;
    side *= 0.8; quality = Math.max(0.5, quality - 0.08);
  }
  throw new Error("Photo is too large. Try a smaller one.");
}
