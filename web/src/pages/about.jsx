// About LastPick: who runs it (founder photo and name), the Udyam (MSME) registration with a link to verify it,
// apps coming soon, and how to reach us. Same page in the customer and partner apps (their own colours).
import { BackButton, SocialLinks } from "../components.jsx";
import { APP_NAME, COMPANY, IS_OWNER_APP, SUPPORT_EMAIL } from "../lib/config.js";
import { Icon } from "../lib/icons.jsx";

export function About() {
  return (
    <div className="page about">
      <div className="row" style={{ justifyContent: "flex-start", gap: 10, padding: "8px 0 4px" }}><BackButton /><h1 className="title" style={{ margin: 0, fontSize: 22 }}>About {APP_NAME}</h1></div>
      <div className="acard center">
        <img className="founder" src={`${import.meta.env?.BASE_URL || "/"}founder.jpg`} alt={`${COMPANY.owner}, founder of ${APP_NAME}`} width="96" height="96" />
        <div style={{ fontWeight: 800, fontSize: 18, marginTop: 10 }}>{COMPANY.owner}</div>
        <div className="muted small">Founder and owner, {APP_NAME}</div>
        <p className="small" style={{ margin: "10px 0 0", lineHeight: 1.55 }}>{IS_OWNER_APP
          ? `${APP_NAME} helps local businesses fill today's empty slots and sell closing-time stock to customers nearby. No commission on your sales.`
          : `${APP_NAME} connects you with local businesses for same-day deals near you. Every rupee stays local.`}</p>
      </div>
      <div className="acard">
        <span className="okpill"><Icon d="shield" size={14} stroke={2.2} />MSME (Udyam) registered · Government of India</span>
        <p className="small" style={{ margin: "10px 0 4px", lineHeight: 1.5 }}>{APP_NAME} is a unit of {COMPANY.enterprise}, a micro enterprise registered with the Ministry of MSME.</p>
        <div className="arow"><span className="muted">Udyam no.</span><b>{COMPANY.udyam}</b></div>
        <div className="arow"><span className="muted">Registered</span><span>{COMPANY.registered}</span></div>
        <div className="arow"><span className="muted">Based in</span><span>{COMPANY.place}</span></div>
        <a className="link small" style={{ display: "inline-block", marginTop: 8, fontWeight: 700 }} href="https://udyamregistration.gov.in/Udyam_Verify.aspx" target="_blank" rel="noopener noreferrer">Verify on udyamregistration.gov.in ↗</a>
      </div>
      <div className="acard" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Icon d="phoneDevice" size={24} stroke={2} />
        <div><b style={{ fontSize: 14.5 }}>Android and iOS apps</b><div className="muted small">Coming soon. Use {IS_OWNER_APP ? `${APP_NAME} Partner` : APP_NAME} in your browser till then.</div></div>
      </div>
      <div className="acard" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <a className="link small" href={"mailto:" + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>
        <SocialLinks />
      </div>
    </div>
  );
}
