// LastPick Terms and Conditions: ONE document for customers and partners.
// Shown in full before anyone can agree (they must scroll to the end). The exact text they saw is stored with their
// acceptance (server: consent_documents + consent_log), so it can be shown later if there is ever a dispute.
// Changing anything here: bump CONSENT_VERSION in lib/config.js AND server/src/util.js, so everyone accepts again.
// Template wording written for an Indian intermediary platform. Have a lawyer review it before launch.
import { APP_NAME, CONSENT_VERSION, LEGAL, PLANS, RETENTION, SUPPORT_EMAIL, WEBSITE_URL } from "./config.js";

const operator = LEGAL.operator || `the operator of ${APP_NAME}`;
const courts = LEGAL.jurisdiction || "Hyderabad, Telangana";
const rupee = (n) => "₹" + Number(n).toLocaleString("en-IN");

// [heading, [paragraphs or bullet lists]]; a bullet list is an array of strings.
export const TERMS_SECTIONS = [
  ["1. About these terms", [
    `These Terms and Conditions ("Terms") are a binding agreement between you and ${operator} ("${APP_NAME}", "we", "us"). They apply to the ${APP_NAME} website, web apps and mobile apps for customers, business partners and the ${APP_NAME} team (together, the "Platform").`,
    `By tapping "I agree" you confirm that you have read these Terms in full and accept them. Your acceptance is an electronic contract under the Information Technology Act, 2000. We keep a record of it: the version and exact text of these Terms you accepted, the date and time, your account, and the device and network address used. We may use this record to show what you agreed to if there is ever a question or dispute.`,
    `If you do not agree, do not use the Platform.`,
  ]],
  ["2. What LastPick is (and is not)", [
    `${APP_NAME} is an online platform and an "intermediary" under the Information Technology Act, 2000. Verified local businesses ("Partners") post same-day offers; people nearby ("Customers") see them and contact the Partner directly.`,
    [
      `${APP_NAME} does not sell, book, deliver, cook, treat, transport, employ, collect payment for, or guarantee anything posted on the Platform.`,
      `Every deal, payment, service and job is directly between the Customer and the Partner. ${APP_NAME} is not a party to it and is not the agent of either side.`,
      `${APP_NAME} only shows offers and connects people. We do not control, and are not responsible for, the quality, safety, legality, price, availability or delivery of any offer.`,
    ],
  ]],
  ["3. Who can use the Platform", [
    [
      `You must be at least 18 years old, able to enter a contract under Indian law, and in India.`,
      `You must give true, current details (name, e-mail, mobile number, and for Partners, a profile photo and business details) and keep them up to date.`,
      `One account per person. A Partner may have one business profile per account.`,
      `The same account works in the customer app and the partner app.`,
    ],
  ]],
  ["4. Your account and security", [
    [
      `You log in with your e-mail or mobile number and a password. Your e-mail is checked with a one-time code when you sign up. Keep your password secret and never share a code with anyone, including people who say they are from ${APP_NAME} or a business. Only one device can be logged in at a time. You are responsible for everything done through your account.`,
      `For security, an account may be logged in on only one device at a time: logging in on a new device logs out the old one. Partner and admin accounts are always limited to one device.`,
      `You are logged out automatically after 15 minutes without activity, and must log in again.`,
      `If you think someone else used your account, tell us at once at ${SUPPORT_EMAIL}; we will log out every device on the account.`,
    ],
  ]],
  ["5. Location", [
    `The Platform works on your location. Customers see offers from Partners within 30 km of where they are; a Partner's shop location and pincode are taken from the phone's location at the shop and cannot be typed by hand.`,
    `You must allow location for the Platform to work. Your location is used to find offers near you and to show your area name; it is sent to our servers only rounded to about 1 km and is not stored. See the Privacy notice.`,
  ]],
  ["6. Rules for Customers", [
    [
      `Check the offer and the Partner yourself before you pay, travel or share anything. Never pay an advance to someone you have not verified.`,
      `When you tap "I'm interested", the Partner sees your first name only, never your mobile number. You can see the Partner's contact number and decide when to contact them.`,
      `Use a Partner's number only to ask about their offer. No spam, abuse or harassment.`,
      `Reviews must be about your own real experience with a Partner you contacted through ${APP_NAME}. No fake, paid or abusive reviews.`,
    ],
  ]],
  ["7. Rules for Partners (businesses)", [
    [
      `Only businesses verified by ${APP_NAME} with an active Business Pro plan can post. Verification is a basic check, not a guarantee of your business.`,
      `You may post only in the one category you registered (for example, a bakery posts only food offers), up to 3 posts a day.`,
      `Offers are for the same day only. You can post between 4 AM and 10:30 PM (India time). Every offer ends by 11 PM and is closed automatically, even if you forget to end it, and is removed at 12 midnight. Only hotels run 24×7: they may post at any time and an offer may run for up to 24 hours.`,
      `Post only genuine offers you can honour. The "normal price" must be the price you really charge; the offer price is the final price with no hidden charges. The discount shown is worked out from these two prices.`,
      `Hold every licence and registration your business needs (for example FSSAI for food, permits for travel operators, GST where it applies) and follow all laws, including consumer protection, weights and measures, and labour laws.`,
      `Use a customer's details only to reply about the offer they showed interest in. No marketing lists, spam, resale or sharing with anyone else.`,
      `Do not post, buy or arrange fake reviews, and do not reward customers for reviews. You may reply to reviews but cannot remove them.`,
      `You are fully responsible for your offers, your service and your dealings with customers.`,
    ],
  ]],
  ["8. Things nobody may post or do", [
    [
      `Alcohol, tobacco or vapes, drugs, prescription medicines, weapons, explosives, gambling or lotteries, adult content, wildlife products, counterfeit or stolen goods, financial or investment schemes, or anything illegal, unsafe or misleading.`,
      `Movie tickets, hall bookings, and selling personal used items.`,
      `False, misleading or bait offers; prices that are not real; offers in a category you are not registered in.`,
      `Impersonating anyone, using someone else's account, creating many accounts, or trying to get around a suspension.`,
      `Hacking, scraping, overloading or interfering with the Platform, or using it to send spam or malware.`,
    ],
  ]],
  ["9. Plans and payments", [
    `Customers use the Platform free of charge: logged-in Customers can see the contact numbers Partners choose to share. Business Pro lets verified Partners post offers; it is sold as packs of 5, 15 or 30 days at the prices shown on the Plans page, which include any taxes that apply. If ${APP_NAME} ever introduces a paid plan for Customers, it will be announced in the app beforehand and never charged without the Customer choosing to pay. ${APP_NAME} may offer a free period (for example at launch); it is announced in the app, and when it ends a paid plan is needed again.`,
    `Plans are paid online through Razorpay (UPI, card or netbanking) and a receipt is e-mailed to you. Each payment gives the days of the pack you chose (5, 15 or 30 days). Plans never renew automatically: a plan runs for the period paid and is not renewed without a new payment from you. Fees are for access to the Platform and are not linked to any deal. See the Refund policy for when a refund is possible.`,
  ]],
  ["10. Reviews, reports and action we may take", [
    `Anyone can report an offer, a review or a user. We review reports, reviews and ratings. If a Partner or Customer breaks these Terms or the law, misleads others or behaves badly, we may, with or without notice: warn them, hide or remove their posts or reviews, pause or remove their business, suspend or close their account, and keep records needed by law. We also act on valid orders from courts and government agencies.`,
  ]],
  ["11. Your content", [
    `You own what you post (offer text, reviews, replies). You allow ${APP_NAME} to show, store, copy and format it on the Platform for as long as needed to run the service. You confirm you have the right to post it and that it is true and lawful.`,
  ]],
  ["12. Privacy and your data", [
    `We handle personal data under the Digital Personal Data Protection Act, 2023 and the DPDP Rules, as explained in the Privacy notice, which is part of these Terms. You can see, download and delete your data from Account → Privacy. Deleting your account withdraws your consent; some records (for example payment and consent records, and activity logs for up to ${Math.round(RETENTION.auditDays / 30)} months) are kept only as long as the law requires.`,
  ]],
  ["13. No guarantee", [
    `The Platform is provided "as is" and "as available". We try to keep it working and accurate, but we do not promise it will always be available, error-free or that any offer is accurate, available or suitable for you.`,
  ]],
  ["14. Limit of our responsibility", [
    `To the fullest extent the law allows, ${APP_NAME} is not responsible for any loss, damage, injury, cost or dispute arising from any offer, deal, service, job, payment, or the conduct of any Customer or Partner, or from use of or inability to use the Platform. Where we are found responsible, our total responsibility is limited to the plan fees you paid us in the 3 months before the claim. Nothing in these Terms takes away any right you have under Indian consumer law that cannot be excluded.`,
  ]],
  ["15. You will cover our losses caused by you", [
    `If you break these Terms or the law, or your offer or conduct harms someone, you will cover ${APP_NAME}'s reasonable losses, costs and legal fees arising from it.`,
  ]],
  ["16. Ending your use", [
    `You can stop using the Platform and delete your account at any time (Account → Privacy → Delete account). We may suspend or close an account under section 10. Sections that by their nature should continue (for example 2, 11, 12, 14, 15 and 18) continue after an account is closed.`,
  ]],
  ["17. Changes to these Terms", [
    `We may change these Terms. When we do, we change the version number and ask everyone to read and accept the new version before continuing. If you do not accept it, you can stop using the Platform and delete your account.`,
  ]],
  ["18. Law, disputes and complaints", [
    `These Terms are governed by the laws of India. Please first raise any complaint with us at Account → Complaints or with our Grievance Officer at ${LEGAL.grievanceEmail}${LEGAL.grievanceOfficer ? ` (${LEGAL.grievanceOfficer})` : ""}. We acknowledge complaints within 24 hours and aim to resolve them within 15 days, as required by the IT Rules, 2021. Subject to that, the courts at ${courts} have jurisdiction.`,
  ]],
  ["19. Contact", [
    `${operator}${LEGAL.address ? `, ${LEGAL.address}` : ""}. Website: ${WEBSITE_URL}. E-mail: ${SUPPORT_EMAIL}.`,
  ]],
];

export const TERMS_TITLE = `${APP_NAME} Terms and Conditions`;

// The exact plain text that is stored with each acceptance.
export function termsText() {
  const lines = [`${TERMS_TITLE}`, `Version ${CONSENT_VERSION}`, ""];
  for (const [h, parts] of TERMS_SECTIONS) {
    lines.push(h);
    for (const p of parts) {
      if (Array.isArray(p)) p.forEach((b) => lines.push(`  • ${b}`));
      else lines.push(p);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// SHA-256 fingerprint of the text (proves later that the stored text is exactly what was shown).
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------------------------------------------
// Partner agreement: the general Terms PLUS rules for the partner's kind of business. Shown in full on the business
// registration screen; the partner must scroll to the end and agree. The exact text (with the category) is stored.
const COMMON_PARTNER = [
  `I am the owner of this business, or authorised by the owner, and the details I give (name, address, shop location, contact number) are true. ${APP_NAME} may verify them and may refuse or remove my business.`,
  `I will post only genuine same-day offers in my registered category, at real prices, with no hidden charges, and I will honour every offer I post.`,
  `I can post between 4 AM and 10:30 PM (India time), up to 3 posts a day; every offer ends by 11 PM and is closed automatically. Only hotels may post at any time, for up to 24 hours.`,
  `Customers' names and details shared with me are only for replying about my offer. I will not misuse, sell or share them.`,
  `I am solely responsible for my goods, services, staff, premises, licences, taxes and my dealings with customers. ${APP_NAME} is only a platform and is not liable for them.`,
  `Business Pro costs ${rupee(PLANS.owner.price)} a month and is needed to post. ${APP_NAME} may pause or remove my business for breaking these rules, without refund for the period lost.`,
];

// Rules for each kind of business (category id -> [title, [rules]]).
export const PARTNER_RULES = {
  food: ["Food businesses (restaurants, bakeries, sweet shops, cafés)", [
    `I hold a valid FSSAI licence or registration and will show its number when asked.`,
    `Food I offer is safe, fresh and fit to eat, stored and handled hygienically. I will not sell food past its use-by date or that has been left unsafe.`,
    `I will clearly state quantity, and whether items are veg / non-veg / contain egg, and common allergens when asked.`,
    `Discounted food is the same quality as at full price; leftover or near-closing food is described honestly.`,
  ]],
  stay: ["Hotels, lodges and stays", [
    `My property has the licences and registrations required by local law (trade licence, police / tourism registration where needed, fire safety).`,
    `I will check every guest's government ID and keep guest records as the law requires, and I will not allow anything illegal on my premises.`,
    `The offer price is the full price for what is described (room type, number of guests, check-in / check-out time), with any taxes stated.`,
    `I will give guests the room as described, or a better one, and handle cancellations and refunds fairly and directly with them.`,
  ]],
  beauty: ["Salons and spas", [
    `My salon has the licences required locally, and staff are trained for the services offered.`,
    `Tools are cleaned and sterilised after every customer; I use genuine products within their expiry date.`,
    `The offer states the exact service, duration and final price; I will tell customers about any patch test or risk before treatments.`,
  ]],
  makeup: ["Makeup artists and studios", [
    `I use genuine, unexpired, hygienic products and clean brushes and tools for every client.`,
    `The offer states exactly what is included (look, duration, travel to the client if any) and the final price.`,
    `I will tell clients about products used, and do a patch test when the client asks or has sensitive skin.`,
  ]],
  fashion: ["Fashion and clothing", [
    `Products are genuine and as described (brand, fabric, size). No counterfeit or copied branded goods.`,
    `The normal price is the real price I sell at; the offer price is final. I will state my exchange / return policy clearly before sale.`,
  ]],
  appliances: ["Home appliances and electronics", [
    `Products are genuine, new unless clearly marked otherwise, and carry the manufacturer's warranty where applicable; I will give a proper GST invoice.`,
    `I will not sell above MRP, and I follow the Legal Metrology rules for packaged goods.`,
    `Refurbished or open-box items are clearly labelled as such.`,
  ]],
  gym: ["Gyms and fitness centres", [
    `My gym has the licences required locally, safe and maintained equipment, and trainers qualified for what they teach.`,
    `The offer states exactly what is included (day pass, session, duration, trainer or not) and the final price.`,
  ]],
  farm: ["Farm fresh (farmers and growers)", [
    `I sell my own fresh produce (vegetables, fruit, milk, eggs, flowers), weighed honestly and priced per kg, litre or piece as stated.`,
    `Produce is fresh and safe to eat; I hold FSSAI registration where the law needs it for what I sell.`,
  ]],
  ads: ["Local ads", [
    `My ad is for my own legal business, product or service, with the real price and conditions stated.`,
    `No misleading claims, no political, adult or illegal content, and no ads for other people's businesses.`,
  ]],
  other: ["Other businesses", [
    `I hold every licence and registration my type of business needs, and my service or product is legal and safe.`,
    `The offer clearly describes what the customer gets and the final price.`,
  ]],
};

export const partnerTermsTitle = (category) => `${APP_NAME} Partner Agreement: ${(PARTNER_RULES[category] || PARTNER_RULES.other)[0]}`;
export function partnerTermsSections(category) {
  const [title, rules] = PARTNER_RULES[category] || PARTNER_RULES.other;
  return [
    ["A. Partner commitments", [COMMON_PARTNER]],
    [`B. Rules for ${title}`, [rules]],
    ["C. LastPick Terms and Conditions (apply to everyone)", ["The full Terms and Conditions below are part of this agreement."]],
    ...TERMS_SECTIONS,
  ];
}
export function partnerTermsText(category) {
  const lines = [partnerTermsTitle(category), `Version ${CONSENT_VERSION}`, `Business category: ${category}`, ""];
  for (const [h, parts] of partnerTermsSections(category)) {
    lines.push(h);
    for (const p of parts) {
      if (Array.isArray(p)) p.forEach((b) => lines.push(`  • ${b}`));
      else lines.push(p);
    }
    lines.push("");
  }
  return lines.join("\n");
}
