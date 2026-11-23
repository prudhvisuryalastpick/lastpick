// About LastPick (bottom-bar tab in the customer and partner apps): the Udyam (MSME) registration details,
// the registered address and the support e-mail. Nothing else, by the owner's choice.
import { APP_NAME, COMPANY, SUPPORT_EMAIL } from "../lib/config.js";
import { Icon } from "../lib/icons.jsx";

export function About() {
  const rows = [
    ["Enterprise", COMPANY.enterprise],
    ["Unit", COMPANY.unit],
    ["Type", COMPANY.type],
    ["Owner", COMPANY.owner],
    ["Registered on", COMPANY.registered],
    ["Address", COMPANY.address],
  ];
  return (
    <div className="page about">
      <h1 className="title" style={{ margin: "8px 0 0", fontSize: 22 }}>About {APP_NAME}</h1>
      <div className="acard">
        <span className="okpill"><Icon d="shield" size={14} stroke={2.2} />MSME (Udyam) registered · Govt. of India</span>
        <div className="arow first"><span>Udyam reg. no.</span><b className="udyam">{COMPANY.udyam}</b></div>
        {rows.map(([k, v]) => <div key={k} className="arow"><span>{k}</span><span>{v}</span></div>)}
        <div className="arow"><span>Support e-mail</span><a className="link" href={"mailto:" + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a></div>
      </div>
    </div>
  );
}
