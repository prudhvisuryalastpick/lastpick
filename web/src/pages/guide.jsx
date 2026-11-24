// Guide tab: the 1-minute how-to video (English) for this app. Loads only when played.
import { IS_OWNER_APP } from "../lib/config.js";

export function Guide() {
  const who = IS_OWNER_APP ? "partner" : "customer";
  return (
    <div className="page guide" style={{ padding: "8px 16px 120px" }}>
      <h1 className="title" style={{ margin: "8px 0 0", fontSize: 22 }}>{IS_OWNER_APP ? "How to post on LastPick" : "How LastPick works"}</h1>
      <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>1-minute guide · English</p>
      <video src={`/guide-${who}.mp4`} poster={`/guide-${who}.jpg`} controls playsInline preload="none" />
    </div>
  );
}
