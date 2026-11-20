// Customer reviews. Only customers who contacted a business through LastPick can review it (checked on the server);
// businesses can reply but not delete; anyone can report a review and moderators hide ones that break the rules.
import { useEffect, useState } from "react";
import { api } from "../api/index.js";
import { Empty, Sheet, Spinner } from "../components.jsx";
import { APP_NAME, REVIEW_REPORT_REASONS } from "../lib/config.js";
import { ago, errText } from "../lib/format.js";
import { useApp } from "../state.jsx";

export function Stars({ value = 0, size = 14 }) {
  const full = Math.round(value);
  return <span aria-label={`${value} out of 5 stars`} style={{ color: "#f5a524", fontSize: size, letterSpacing: 1 }}>{"★".repeat(full)}<span style={{ color: "#d9dbe3" }}>{"★".repeat(5 - full)}</span></span>;
}

export function RatingBadge({ rating }) {
  if (!rating?.count) return null;
  return <span className="small" style={{ fontWeight: 600 }}><span style={{ color: "#f5a524" }}>★</span> {Number(rating.avg).toFixed(1)} <span className="muted">({rating.count})</span></span>;
}

function ReviewItem({ r, onReport }) {
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <div className="row"><span><b className="small">{r.name}</b> <Stars value={r.rating} size={13} /></span><span className="muted small">{ago(r.createdAt)}{r.edited ? " · edited" : ""}</span></div>
      <div className="muted small">✔ Contacted via {APP_NAME}{r.offerTitle ? ` · ${r.offerTitle}` : ""}</div>
      {r.text && <div className="small" style={{ marginTop: 4, whiteSpace: "pre-line" }}>{r.text}</div>}
      {r.reply && <div className="box small" style={{ marginTop: 6 }}><b>Reply from the business:</b> {r.reply.text}</div>}
      {onReport && <button className="link small" style={{ marginTop: 4 }} onClick={() => onReport(r)}>Report</button>}
    </div>
  );
}

// Shown on an offer page: rating summary, latest reviews, "Rate this business".
export function ReviewsBlock({ business, own }) {
  const { session } = useApp();
  const [list, setList] = useState(null);
  const [mine, setMine] = useState(null);
  const [all, setAll] = useState(false);
  const [writing, setWriting] = useState(false);
  const [reporting, setReporting] = useState(null);
  const load = () => {
    api.listReviews(business.id).then(setList).catch(() => setList([]));
    if (session && !own) api.myReview(business.id).then(setMine).catch(() => {});
  };
  useEffect(() => { if (business?.id) load(); }, [business?.id, session]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!business?.id) return null;
  const count = list?.length || 0;
  const avg = count ? list.reduce((n, r) => n + r.rating, 0) / count : 0;
  const shown = all ? list : (list || []).slice(0, 3);
  return (
    <div className="panel" style={{ margin: "14px 0 0" }}>
      <div className="row"><b>Reviews</b>{count > 0 && <span className="small"><Stars value={avg} /> {avg.toFixed(1)} · {count}</span>}</div>
      {!list ? <Spinner /> : count === 0 ? <div className="muted small" style={{ paddingTop: 6 }}>No reviews yet. Customers who contact this business through {APP_NAME} can rate it.</div>
        : shown.map((r) => <ReviewItem key={r.id} r={r} onReport={session && !own && r.id !== mine?.id ? setReporting : null} />)}
      {count > 3 && !all && <button className="link small" onClick={() => setAll(true)}>Show all {count} reviews</button>}
      {session && !own && <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setWriting(true)}>⭐ {mine ? "Edit your review" : "Rate this business"}</button>}
      {writing && <ReviewSheet businessId={business.id} businessName={business.name} existing={mine} onClose={() => setWriting(false)} onDone={() => { setWriting(false); load(); }} />}
      {reporting && <ReportReviewSheet review={reporting} onClose={() => setReporting(null)} />}
    </div>
  );
}

export function ReviewSheet({ businessId, businessName, existing, onClose, onDone }) {
  const { toast } = useApp();
  const [rating, setRating] = useState(existing?.rating || 0);
  const [text, setText] = useState(existing?.text || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.submitReview(businessId, rating, text.trim());
      toast(r?.hidden ? "Saved. This review was hidden by our team, so it isn't public." : "Thanks for your review!");
      onDone?.();
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <Sheet onClose={onClose}>
      <h2 className="title" style={{ fontSize: 19 }}>Rate {businessName || "this business"}</h2>
      <div className="gap" style={{ margin: "12px 0", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)}
            style={{ fontSize: 34, lineHeight: 1, background: "none", border: 0, padding: 2, cursor: "pointer", color: n <= rating ? "#f5a524" : "#d9dbe3" }}>★</button>
        ))}
      </div>
      <div className="fld"><label className="small">Your experience (optional)</label>
        <textarea rows="3" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Did they honour the offer? How was it?" /></div>
      <div className="muted small" style={{ marginTop: 6 }}>Shown with your first name. No phone numbers, e-mails or links. Write only about your own experience.</div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      <button className="btn main" style={{ marginTop: 12 }} disabled={busy || !rating} onClick={send}>{busy ? "Saving…" : existing ? "Update review" : "Post review"}</button>
    </Sheet>
  );
}

function ReportReviewSheet({ review, onClose }) {
  const { toast } = useApp();
  const [reason, setReason] = useState(REVIEW_REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.reportReview(review.id, reason, details.trim()); toast("Thanks. Our team will check this review."); onClose(); }
    catch (e) { toast(errText(e)); setBusy(false); }
  };
  return (
    <Sheet onClose={onClose}>
      <h2 className="title" style={{ fontSize: 19 }}>Report this review</h2>
      <div className="form" style={{ padding: "12px 0 0" }}>
        <div className="fld"><label>What's wrong?</label><select value={reason} onChange={(e) => setReason(e.target.value)}>{REVIEW_REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div className="fld"><label>Details (optional)</label><textarea rows="2" maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
        <button className="btn main" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send report"}</button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Owner: reviews of my business, with replies
export function OwnerReviews() {
  const { business, toast } = useApp();
  const [list, setList] = useState(null);
  const [draft, setDraft] = useState({});
  const load = () => api.ownerReviews().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const reply = async (r) => {
    try { await api.replyReview(r.id, (draft[r.id] ?? "").trim()); toast("Reply saved"); setDraft({ ...draft, [r.id]: undefined }); load(); } catch (e) { toast(errText(e)); }
  };
  const pub = (list || []).filter((r) => r.status === "published");
  const avg = pub.length ? pub.reduce((n, r) => n + r.rating, 0) / pub.length : 0;
  return (
    <>
      <div className="page-h"><h1 className="title">Reviews</h1>
        <div className="muted">{pub.length ? <><Stars value={avg} /> {avg.toFixed(1)} from {pub.length} review{pub.length > 1 ? "s" : ""}</> : `What customers say about ${business?.name || "your business"}`}</div></div>
      <div className="muted small pad" style={{ paddingTop: 0 }}>Only customers who contacted you through {APP_NAME} can review you. You can reply to any review. Think a review breaks the rules? Raise a <a className="link" href="#/grievance">complaint</a>.</div>
      {!list ? <Spinner /> : list.length === 0 ? <Empty icon="⭐" title="No reviews yet">When customers rate you, their reviews appear here.</Empty> : list.map((r) => (
        <div className="panel" key={r.id}>
          <ReviewItem r={r} />
          {r.status === "hidden" && <div className="pill p-mute">Hidden by {APP_NAME} moderators</div>}
          {draft[r.id] !== undefined ? <>
            <div className="fld" style={{ marginTop: 6 }}><textarea rows="2" maxLength={500} value={draft[r.id]} onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })} placeholder="Thank the customer or explain what happened" /></div>
            <div className="gap" style={{ marginTop: 8 }}><button className="btn main sm" onClick={() => reply(r)}>Save reply</button><button className="btn ghost sm" onClick={() => setDraft({ ...draft, [r.id]: undefined })}>Cancel</button></div>
          </> : <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setDraft({ ...draft, [r.id]: r.reply?.text || "" })}>{r.reply ? "Edit reply" : "Reply"}</button>}
        </div>
      ))}
    </>
  );
}
