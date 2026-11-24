// Partner app home for visitors who aren't logged in: built like the customer home (same sticker hero, glass card,
// live counts, category tiles, banners and "how it works"), in partner colours. Log in and Create account sit top right.
import { BIZ_TYPE_KEY } from "./auth.jsx";
import { ContactCard } from "./contactus.jsx";
import { SectionHead } from "./customer.jsx";
import { IconSticker, StickerHero } from "./hero.jsx";
import { JoinedTicker, SocialLinks, useStats } from "../components.jsx";
import { PLANS, packCompare, perDay } from "../lib/config.js";
import { rupee } from "../lib/format.js";
import { HOME_TILES, Icon, catStyle } from "../lib/icons.jsx";
import { navigate, useApp } from "../state.jsx";
import { Logo } from "../lib/brand.jsx";

const signup = (type) => {
  try { if (type) localStorage.setItem(BIZ_TYPE_KEY, type); } catch { /* ignore */ }
  navigate("/login?start=signup");
};

const SLIDE = {
  tag: "No commission · verified shops only",
  title: <>Fill today's<br />empty slots</>,
  sub: "Post leftover stock, empty rooms and free chairs. Customers within 30 km call you directly.",
  cta: "Create free account",
  art: [["store", "#FFEDD5", "#9A3412"], ["bed", "#DBEAFE", "#1D4ED8"], ["scissors", "#FCE7F3", "#BE185D"], ["rupeeSave", "#DCFCE7", "#15803D"]],
};

export function PartnerLanding() {
  const { place } = useApp();
  const stats = useStats(place?.pincode || "");
  const top = (
    <div className="shero-top">
      <span className="plogo"><Logo size={38} /></span>
      <span className="gap" style={{ gap: 6 }}>
        <SocialLinks className="glassy-icons" />
        <a className="pill glassy sm" href="#/login">Log in</a>
        <button type="button" className="pill gold sm" onClick={() => signup()}>Create account</button>
      </span>
    </div>
  );
  const packs = PLANS.owner.packs;
  return (
    <>
      <StickerHero top={top} variant="partner" slide={SLIDE} badge="NO · COMMISSION · VERIFIED · " badgeIcon="check" onOpen={() => signup()}
        pill={<a className="pill light" href="#/guide">Watch 1-min guide</a>}
        counts={stats ? [
          stats.partners.area != null ? { icon: "store", n: stats.partners.area, label: `partners in ${place?.pincode}` } : { icon: "store", n: stats.partners.total, label: "partners" },
          { icon: "user", n: stats.customers.total, label: "customers" },
        ] : null} />
      {stats?.joined?.length > 0 && <JoinedTicker joined={stats.joined} />}
      <SectionHead title="Who it's for" />
      <div className="catgrid">
        {HOME_TILES.map((t, k) => { const st = catStyle(t.id); return (
          <button key={t.id} className="cattile" onClick={() => signup(t.id)}>
            <IconSticker icon={st.icon} bg={st.tint} fg={st.ink} size={50} rot={[-6, 4, -3, 6][k % 4]} />
            <b>{st.short}</b><span>Join free</span>
          </button>); })}
      </div>
      <div className="bigbanners">
        <button className="bigban dark" onClick={() => signup()}><span><small>POST IN 1 MINUTE</small><b>Customers call you</b><em>Within 30 km, the same day</em></span><IconSticker icon="phone" bg="#FFEDD5" fg="#9A3412" size={58} rot={8} /></button>
        <button className="bigban light" onClick={() => signup()}><span><small>0% COMMISSION</small><b>Keep every rupee</b><em>Customers pay you directly</em></span><IconSticker icon="rupeeSave" bg="#DCFCE7" fg="#15803D" size={58} rot={-6} /></button>
      </div>
      <SectionHead title="How it works" />
      <div className="howgrid">
        {[["1", "Register free", "Your name, mobile, shop and business type. Takes 2 minutes."], ["2", "Get verified", "LastPick checks your business (KYC) before offers go live."], ["3", "Post offers", "Up to 3 a day. Customers near you see them and call you."]].map(([n, t, d]) => (
          <div key={n} className="howcard"><span className="num">{n}</span><b>{t}</b><span>{d}</span></div>))}
      </div>
      <SectionHead title={`${PLANS.owner.name} · from ₹${perDay(packs[packs.length - 1])} a day`} />
      <div className="packs">
        {packs.map((o, i) => {
          const cmp = packCompare("owner", o), best = i === packs.length - 1, d = perDay(o);
          return (
            <button key={o.days} type="button" className={"pack" + (best ? " on" : "")} onClick={() => signup()}>
              {cmp && <span className={"tag " + (best ? "best" : "")}>{best ? "Best value · " : ""}Save {cmp.save}%</span>}
              <span className="grow"><span className="d" style={{ display: "block" }}>{o.days} days</span><span className="pd">{i === 0 ? `₹${d} a day · try it out` : best ? `Just ₹${d} a day` : `Under ₹${Math.ceil(d)} a day (₹${d})`}</span></span>
              <span style={{ textAlign: "right" }}>{cmp && <span className="was" style={{ display: "block" }}>{rupee(cmp.was)}</span>}<span className="pr">{rupee(o.price)}</span></span>
            </button>);
        })}
      </div>
      <ContactCard style={{ margin: "14px 16px 0" }} />
      <div className="pad" style={{ paddingBottom: 32 }}>
        <button type="button" className="btn main" style={{ width: "100%" }} onClick={() => signup()}>Create free account</button>
        <a className="btn ghost" style={{ width: "100%", marginTop: 8 }} href="#/login">I have an account · Log in</a>
      </div>
    </>
  );
}
