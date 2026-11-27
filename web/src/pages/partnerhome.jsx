// Partner app home for visitors who aren't logged in: built like the customer home (same sticker hero, glass card,
// live counts, category tiles, banners and "how it works"), in partner colours. Log in and Create account sit top right.
import { BIZ_TYPE_KEY } from "./auth.jsx";
import { ContactCard } from "./contactus.jsx";
import { SectionHead, WhereChip, useWhere } from "./customer.jsx";
import { IconSticker, PhotoSticker, StickerHero } from "./hero.jsx";
import { InstallTopButton, JoinedTicker, QuoteStrip, SocialLinks, useStats } from "../components.jsx";
import { PLANS, packCompare, perDay } from "../lib/config.js";
import { rupee } from "../lib/format.js";
import { HOME_TILES, Icon, catStyle } from "../lib/icons.jsx";
import { navigate, useApp } from "../state.jsx";
import { Logo } from "../lib/brand.jsx";

const signup = (type) => {
  try { if (type) localStorage.setItem(BIZ_TYPE_KEY, type); } catch { /* ignore */ }
  navigate("/login?start=signup");
};

// Banner lines: one per kind of business plus a few for everyone. The banner moves to the next every few
// seconds, in a new random order for each visitor; "Create free account" starts sign-up for that business type.
const SLIDES = [
  { tag: "No commission · verified shops only", title: "Fill today's\nempty slots", sub: "Post leftover stock, empty rooms and free chairs. Customers within 30 km call you directly.",
    art: [["store", "#FFEDD5", "#9A3412"], ["bed", "#DBEAFE", "#1D4ED8"], ["scissors", "#FCE7F3", "#BE185D"], ["rupeeSave", "#DCFCE7", "#15803D"]] },
  { cat: "food", tag: "For food shops", title: "Sell out before\nyou close", sub: "Cakes and meals left at 8 PM? Post them at half price.",
    art: [["food", "#FFEDD5", "#9A3412"], ["pot", "#FEF3C7", "#92400E"], ["clock", "#FFE4E6", "#BE123C"], ["rupeeSave", "#DCFCE7", "#15803D"]] },
  { cat: "stay", tag: "For hotels", title: "No empty room\ntonight", sub: "Post tonight's free rooms and let nearby guests call you.",
    art: [["bed", "#DBEAFE", "#1D4ED8"], ["stay", "#E0E7FF", "#4338CA"], ["moon", "#FEF3C7", "#92400E"], ["phone", "#DCFCE7", "#15803D"]] },
  { cat: "beauty", tag: "For salons", title: "Fill every free\nchair today", sub: "Quiet afternoon? Post a slot deal in one minute.",
    art: [["scissors", "#FCE7F3", "#BE185D"], ["brush", "#FDE7F3", "#A3245E"], ["clock", "#FEF3C7", "#92400E"], ["star", "#DCFCE7", "#15803D"]] },
  { cat: "gym", tag: "For gyms", title: "Fill today's\nempty slots", sub: "Post day passes and sessions. People nearby call you.",
    art: [["dumbbell", "#DBEAFE", "#1D4ED8"], ["clock", "#FEF3C7", "#92400E"], ["user", "#CCFBF1", "#0F766E"], ["phone", "#DCFCE7", "#15803D"]] },
  { cat: "makeup", tag: "For makeup artists", title: "Turn free hours\ninto bookings", sub: "Post a same-day offer. Customers call you directly.",
    art: [["brush", "#FDE7F3", "#A3245E"], ["star", "#FCE7F3", "#BE185D"], ["spark", "#FFE4E6", "#BE123C"], ["phone", "#DCFCE7", "#15803D"]] },
  { cat: "farm", tag: "For farmers", title: "Sell today's\nharvest, today", sub: "Add your vegetables and fruit with prices. Buyers nearby call you.",
    art: [["leaf", "#DCFCE7", "#15803D"], ["bag", "#FEF3C7", "#92400E"], ["rupeeSave", "#DCFCE7", "#15803D"], ["phone", "#FFEDD5", "#9A3412"]] },
  { cat: "ads", tag: "Local ads", title: "Tell your street\nwhat's new", sub: "Post a local ad for today. People within 30 km see it.",
    art: [["megaphone", "#FFEDD5", "#9A3412"], ["store", "#FEF3C7", "#92400E"], ["place", "#CCFBF1", "#0F766E"], ["heart", "#FCE7F3", "#BE185D"]] },
].map((x) => ({ ...x, cta: "Create free account" }));


export function PartnerLanding() {
  const { place, config } = useApp();
  const stats = useStats(place?.pincode || "");
  const where = useWhere();
  const top = (
    <div className="shero-top">
      <span className="tleft"><span className="plogo"><Logo size={38} /></span><WhereChip where={where} /></span>
      <span className="gap" style={{ gap: 6 }}>
        <InstallTopButton />
        <SocialLinks className="glassy-icons" />
        <a className="pill glassy sm" href="#/login">Log in</a>
      </span>
    </div>
  );
  const packs = PLANS.owner.packs;
  return (
    <>
      <StickerHero top={top} variant="partner" slides={SLIDES} badge="NO · COMMISSION · VERIFIED · " badgeIcon="check" onOpen={(type) => signup(type)}
        pill={<a className="pill light" href="#/guide">Watch 1-min guide</a>}
        counts={stats ? [
          stats.partners.area != null ? { icon: "store", n: stats.partners.area, label: `partners in ${place?.pincode}` } : { icon: "store", n: stats.partners.total, label: "partners" },
          { icon: "user", n: stats.customers.total, label: "customers" },
        ] : null} />
      <QuoteStrip variant="inline" partner />
      {stats?.joined?.length > 0 && <JoinedTicker joined={stats.joined} />}
      <SectionHead title="Who it's for" />
      <div className="catgrid">
        {HOME_TILES.map((t, k) => { const st = catStyle(t.id); return (
          <button key={t.id} className="cattile" onClick={() => signup(t.id)}>
            <PhotoSticker photos={config?.categoryPhotos?.[t.id]} icon={st.icon} bg={st.tint} fg={st.ink} size={54} rot={[-6, 4, -3, 6][k % 4]} offset={k} />
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
      <ContactCard style={{ margin: "14px 16px 16px" }} />
    </>
  );
}
