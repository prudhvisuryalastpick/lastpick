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

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(",");
  const type = /data:([^;]+)/.exec(head)?.[1] || "application/octet-stream";
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// length of a video file in seconds (read on the phone, nothing is uploaded)
export function videoSeconds(file) {
  return new Promise((res) => {
    const v = document.createElement("video"); v.preload = "metadata";
    const url = URL.createObjectURL(file);
    const done = (n) => { URL.revokeObjectURL(url); res(n); };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => done(0);
    v.src = url;
  });
}

// upload a file with progress (0-100), e.g. straight to R2 with a signed link
export function putWithProgress(url, blob, type, onProgress) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    if (type) x.setRequestHeader("Content-Type", type);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? res() : rej(new Error("Upload failed. Please try again.")));
    x.onerror = () => rej(new Error("Upload failed. Check your internet and try again."));
    x.send(blob);
  });
}
