// Loading feedback for every server request, everywhere in the app:
//  - a thin animated bar at the top while anything is loading (shown after 250 ms, so quick answers don't flash)
//  - the button or link that started the request shows a spinner and can't be tapped again until it finishes
// Background checks (settings, login check) pass quiet and show nothing.
let pending = 0, barTimer = null, lastTap = null, lastTapAt = 0;
const busyButtons = new Map(); // element -> requests still running for it

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const el = e.target?.closest?.("button, a.btn, [role=button]");
    if (el) { lastTap = el; lastTapAt = Date.now(); }
  }, true);
}

function bar() {
  let el = document.getElementById("lp-progress");
  if (!el) { el = document.createElement("div"); el.id = "lp-progress"; el.setAttribute("role", "progressbar"); el.setAttribute("aria-label", "Loading"); document.body.appendChild(el); }
  return el;
}

export function startRequest({ quiet = false } = {}) {
  if (quiet || typeof document === "undefined") return () => {};
  pending += 1;
  if (pending === 1) { clearTimeout(barTimer); barTimer = setTimeout(() => bar().classList.add("on"), 250); }
  // a request that starts within 200 ms of a tap belongs to that button
  const btn = lastTap && Date.now() - lastTapAt < 200 && document.contains(lastTap) ? lastTap : null;
  if (btn) {
    busyButtons.set(btn, (busyButtons.get(btn) || 0) + 1);
    btn.classList.add("is-busy"); btn.setAttribute("aria-busy", "true");
  }
  let done = false;
  return () => {
    if (done) return; done = true;
    pending = Math.max(0, pending - 1);
    if (!pending) { clearTimeout(barTimer); document.getElementById("lp-progress")?.classList.remove("on"); }
    if (btn) {
      const n = (busyButtons.get(btn) || 1) - 1;
      if (n > 0) busyButtons.set(btn, n);
      else { busyButtons.delete(btn); btn.classList.remove("is-busy"); btn.removeAttribute("aria-busy"); }
    }
  };
}
