// The help button (bottom right, above the menu) and its panel: search + question boxes that open to show the
// answer. One "Contact LastPick" button at the bottom (call back, message or e-mail) for anything not covered.
import { useEffect, useMemo, useRef, useState } from "react";
import { CUSTOMER_FAQ, PARTNER_FAQ } from "../lib/faq.js";
import { Icon } from "../lib/icons.jsx";
import { navigate } from "../state.jsx";

export function HelpButton({ partner }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [openQ, setOpenQ] = useState(null);
  const box = useRef(null);
  const faq = partner ? PARTNER_FAQ : CUSTOMER_FAQ;
  const groups = useMemo(() => {
    const v = q.trim().toLowerCase();
    if (!v) return faq;
    return faq.map(([g, qs]) => [g, qs.filter(([qq, a]) => `${qq} ${a}`.toLowerCase().includes(v))]).filter(([, qs]) => qs.length);
  }, [faq, q]);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", esc);
    box.current?.querySelector("input")?.focus();
    return () => removeEventListener("keydown", esc);
  }, [open]);
  const ticket = () => { setOpen(false); navigate("/get-help"); };
  const searching = !!q.trim();
  return (
    <>
      <button type="button" className="helpfab" aria-label="Help: common questions" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon d={open ? "M6 6l12 12M18 6L6 18" : "help"} size={24} stroke={2.2} />
      </button>
      {open && (
        <div className="helpdim" onClick={() => setOpen(false)}>
          <div className="helppanel" role="dialog" aria-modal="true" aria-label="Help" ref={box} onClick={(e) => e.stopPropagation()}>
            <div className="hh"><span className="hav"><Icon d="help" size={18} stroke={2.2} /></span>
              <div className="grow"><b>{partner ? "LastPick Partner help" : "LastPick help"}</b><span>Find your answer in seconds</span></div>
              <button type="button" className="hx" aria-label="Close help" onClick={() => setOpen(false)}><Icon d="M6 6l12 12M18 6L6 18" size={18} stroke={2.4} /></button></div>
            <div className="hs"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={partner ? "Search, like KYC, posting, days left" : "Search, like refund, payment, location"} aria-label="Search questions" /></div>
            <div className="hl">
              {groups.length === 0 ? <div className="hnone"><b>No answer found for that.</b><span>Contact LastPick and our team will help you.</span></div>
                : groups.map(([g, qs]) => (
                  <div key={g}><div className="hg">{g}</div>
                    {qs.map(([qq, a]) => {
                      const on = searching || openQ === qq;
                      return (
                        <div key={qq} className={"hq" + (on ? " open" : "")}>
                          <button type="button" aria-expanded={on} onClick={() => setOpenQ(openQ === qq ? null : qq)}><span>{qq}</span><Icon d="chevDown" size={16} stroke={2.4} /></button>
                          {on && <div className="ha">{a}</div>}
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
            <div className="hf"><span>Didn't find your answer?</span><button type="button" className="btn main" onClick={ticket}><Icon d="headset" size={19} stroke={2.1} />Contact LastPick</button></div>
          </div>
        </div>
      )}
    </>
  );
}
