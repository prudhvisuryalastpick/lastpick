// About LastPick (bottom-bar tab in the customer and partner apps): the Udyam (MSME) registration details,
// the registered address and the support e-mail, then "People who lifted me up" (scrolling), the family note and the founder's quote.
import { APP_NAME, COMPANY, SUPPORT_EMAIL } from "../lib/config.js";
import { Icon } from "../lib/icons.jsx";
import { useState } from "react";

// Wording chosen by the founder (Prudhvi Surya). No photos: everyone shows coloured initials ([background, text]).
const P = (name, bg, fg) => ({ name, bg, fg });
// "People who lifted me up": one card each, scrolling right to left, in a new random order on every visit
export const LIFTED = [
  { people: [P("Harsha Gogineni", "#E6F1FB", "#0C447C")], line: "My first manager. Gave me my first real shot." },
  { people: [P("Maulik Patel", "#EEEDFE", "#3C3489")], line: "The team lead who levelled me up. Respect." },
  { people: [P("Shankar", "#DBEAFE", "#1D4ED8")], line: "Saw the spark, gave me the shot. Legend." },
  { people: [P("Ravi", "#EEEDFE", "#3C3489"), P("Rebecca", "#FBEAF0", "#72243E")], line: "Handed me the DevSecOps keys. Absolute legends." },
  { people: [P("Rajul", "#E1F5EE", "#085041")], line: "Brought me into Creyente Infotech. Plot twist unlocked." },
  { people: [P("Pavan Kalyan", "#D6F5E9", "#085041")], line: "Friend + motivator. Never lets me quit." },
  { people: [P("Raja Sekhar Reddy Lingala", "#FFEDD5", "#9A3412")], line: "Always in my corner. Big love." },
  { people: [P("Rakesh Singi Reddy", "#FEF3C7", "#92400E")], line: "Showed up when it mattered most." },
  { people: [P("Hasa", "#FBEAF0", "#72243E")], line: "Believed I could do my best before I did." },
  { people: [P("Sameeksha Singh", "#FDE7F3", "#A3245E")], line: "Stood by me and said \u201cyou can\u201d. I did." },
  { people: [P("Soniya", "#E0F2FE", "#075985")], line: "Steady support, zero doubts. Grateful." },
  { people: [P("Pranathi", "#FCE7F3", "#9D174D")], line: "Cheered the loudest when I needed it." },
  { people: [P("Ashansa", "#FBEAF0", "#72243E")], line: "Hype person, mentor and reality check, all in one." },
  { people: [P("Havila Monalisa", "#FDE7F3", "#A3245E")], line: "Day-one bestie. Good vibes only." },
  { people: [P("Balu Bandela", "#DBEAFE", "#1D4ED8")], line: "Ride or die. Answers on the first ring." },
  { people: [P("Ranga Rajiv", "#FFEDD5", "#9A3412")], line: "Looked after me like family. Pure gold." },
  { people: [P("Sunil Kaladandi", "#FEF3C7", "#92400E")], line: "Advice that actually hits, every single time." },
  { people: [P("Abhishek", "#D6F5E9", "#085041")], line: "Made me stronger when it got tough. Built different." },
  { people: [P("Benny", "#E0F2FE", "#075985")], line: "My motivator. Said keep going, so I did." },
];
// "To my family, with love", in the founder's order
export const FAMILY = [
  { people: [P("Sudheer", "#DBEAFE", "#1D4ED8"), P("Shantha Kumari", "#FDE7F3", "#A3245E")], label: "Dad and Mom" },
  { people: [P("Nireekshana Bharthi", "#EEEDFE", "#3C3489"), P("Mahesh", "#E0F2FE", "#075985")], label: "Sister and brother-in-law" },
  { people: [P("Pallavi", "#FBEAF0", "#72243E"), P("Giri", "#D6F5E9", "#085041")], label: "Sister and brother-in-law" },
  { people: [P("Vijay Surya", "#D6F5E9", "#085041"), P("Aamani Reddy", "#FCE7F3", "#9D174D")], label: "Brother and sister-in-law" },
  { people: [P("Ajay Surya", "#DBEAFE", "#1D4ED8"), P("Priya Darshini", "#EEEDFE", "#3C3489")], label: "Brother and sister-in-law" },
  { people: [P("Teja Surya", "#FDE7F3", "#A3245E"), P("Kejiya", "#FEF3C7", "#92400E")], label: "Brother and sister-in-law" },
  { people: [P("Chandana Surya", "#FEF3C7", "#92400E")], label: "Sister" },
  { people: [P("Thammu", "#DBEAFE", "#1D4ED8"), P("Jasline", "#FCE7F3", "#9D174D"), P("Vicky", "#FFEDD5", "#9A3412")], label: "Uncle, aunt and Vicky" },
  { people: [P("Hilda", "#FDE7F3", "#A3245E"), P("Ramanna", "#E1F5EE", "#085041")], label: "Aunt and uncle" },
  { people: [P("Chinni", "#D6F5E9", "#085041"), P("Bunny", "#FEF3C7", "#92400E")], label: "Brothers-in-law" },
];
// the special group, in one line
export const SPECIAL = [
  { people: [P("Aruna", "#FCE7F3", "#9D174D")], label: "Elder sister" },
  { people: [P("Madhukar Reddy", "#FAEEDA", "#633806")], label: "Guru, all time" },
  { people: [P("Mittu", "#E0F2FE", "#075985")], label: "Brother-in-law, the idea guy" },
  { people: [P("Shanthan", "#FFEDD5", "#9A3412")], label: "Elder brother" },
];
const FAMILY_NOTE = "Dad, Mom and the whole family: you were my first fans and you're my forever home. Your blessings are the real fuel behind LastPick. Everything I build, I build with you in my heart.";
const EVERYONE = "The list is too long to fit on one page, but every call, every word of support and every \u201cyou can do it\u201d is part of this story. Thank you, all of you.";
const QUOTE = ["Every fall taught me how to rise.", "And I'm still rising."];
const initials = (n) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const first = (n) => n.split(/\s+/)[0];
const joinNames = (ps) => ps.length === 1 ? ps[0].name : ps.length === 2 ? `${ps[0].name} & ${ps[1].name}` : `${ps.slice(0, -1).map((p) => p.name).join(", ")} & ${ps[ps.length - 1].name}`;

export function Avatar({ name, bg, fg }) {
  return <span className="tav" style={{ background: bg, color: fg }}>{initials(name)}</span>;
}

// a fresh order on every visit, so nobody's name is always at the end
const shuffled = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function Faces({ list, className }) {
  return (
    <div className={className}>
      {list.map((c) => (
        <div key={c.people[0].name} className={"face" + (c.people.length > 2 ? " trio" : "")}>
          <span className="tpair">{c.people.map((p) => <Avatar key={p.name} {...p} />)}</span>
          <b>{c.people.length === 3 ? joinNames(c.people) : c.people.map((p) => (c.people.length > 1 && p.name.endsWith(" Surya") ? first(p.name) : p.name)).join(" & ")}</b>
          {c.label && <small>{c.label}</small>}
        </div>
      ))}
    </div>
  );
}

function Thanks() {
  const [order] = useState(() => shuffled(LIFTED));
  const card = (c, k, hidden) => (
    <div key={k} className="mcard" aria-hidden={hidden || undefined}>
      <span className="tpair">{c.people.map((p) => <Avatar key={p.name} {...p} />)}</span>
      <b>{joinNames(c.people)}</b>
      <small>{c.line}</small>
    </div>
  );
  return (
    <>
      <section className="lifted" aria-label="People who lifted me up">
        <div className="jkick">People who lifted me up</div>
        <div className="marquee"><div className="mtrack" style={{ animationDuration: order.length * 4.5 + "s" }}>
          {order.map((c, i) => card(c, "a" + i))}
          {order.map((c, i) => card(c, "b" + i, true))}
        </div></div>
      </section>
      <section className="famcard" aria-label="To my family, with love">
        <div className="jkick fam">To my family, with love</div>
        <p className="fmsg">{FAMILY_NOTE}</p>
        <Faces list={FAMILY} className="faces" />
        <div className="jkick fam special">My special ones</div>
        <Faces list={SPECIAL} className="faces one" />
      </section>
      <section className="everyone" aria-label="And to everyone else">
        <b>And to everyone else</b>
        <p>{EVERYONE}</p>
      </section>
      <figure className="tquote">
        <span className="qm" aria-hidden="true">“</span>
        <blockquote>{QUOTE[0]}<br />{QUOTE[1]}</blockquote>
        <figcaption>— {COMPANY.owner}</figcaption>
      </figure>
    </>
  );
}

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
      <Thanks />
    </div>
  );
}
