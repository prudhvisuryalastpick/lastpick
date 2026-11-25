// Help (FAQ) shown in the help button of the customer and partner apps. Plain answers, kept in step with the
// product rules (README "Product rules built in") and the prices in config.js (PLANS packs).
import { PLANS } from "./config.js";

const packs = (p) => PLANS[p].packs.map((x) => `₹${x.price} for ${x.days} days`).join(", ").replace(/, ([^,]*)$/, " or $1");
const perDayBest = (p) => { const b = PLANS[p].packs[PLANS[p].packs.length - 1]; return `₹${Math.round((b.price / b.days) * 10) / 10}`; };

export const CUSTOMER_FAQ = [
  ["How LastPick works", [
    ["What is LastPick?", "LastPick shows same-day deals from verified local businesses near you: food, hotels, salons, makeup, gyms, farm-fresh produce, fashion, home appliances, local ads and more."],
    ["Are deals really for today only?", "Yes. Every offer is valid for today only and is removed at 12 midnight. Hotels can run up to 24 hours."],
    ["What time are offers shown?", "From 4 AM to 11 PM (India time). Hotels are available 24×7."],
    ["How far away are the deals?", "Within 30 km of your live location. The top of the home screen shows your area and pincode."],
    ["Why does LastPick need my location?", "To show offers near you. If location is off, the app asks you to turn it on. Your location isn't shared with businesses."],
    ["Does LastPick sell the products?", "No. LastPick only connects you with the business. The offer, payment and service are between you and the business."],
  ]],
  ["Is it free?", [
    ["Do I need to pay to use LastPick?", "No. LastPick is free for customers: browse every offer and see the owner's number after you log in. There's no pass and nothing to pay."],
    ["Will it always be free?", "It's free now. If that ever changes, we'll tell you in the app first, and nothing is ever charged without you choosing to pay."],
  ]],
  ["Contacting a business", [
    ["How do I contact a business?", "Open the offer and log in. You'll see the business's phone number and a Call button. Some businesses don't share a number; for those, just walk in."],
    ["How do I tell a shop I'm interested?", "Tap I'm interested on the offer. The shop sees only your name, never your number."],
    ["Do I pay LastPick for the deal?", "No. You pay the business directly. Never pay an advance to someone you haven't verified."],
    ["Where do I see shops I contacted?", "In History, at the bottom of the app."],
  ]],
  ["My account", [
    ["Can I use LastPick on two phones?", "You can be logged in on one device at a time. Logging in on a new device logs out the old one."],
    ["Why was I logged out?", "For your safety, the app logs out after 15 minutes without activity, or if you logged in on another device."],
    ["I forgot my password", "On the login screen tap Forgot password. We'll e-mail you a 6-digit code to set a new one."],
    ["How do I change my mobile number?", "Account → Your details → Phone number. It must be a valid 10-digit Indian mobile number."],
    ["How do I delete my account?", "Account → Privacy & your data → Delete my account."],
  ]],
  ["Safety & refunds", [
    ["Are businesses verified?", "Yes. Every partner is checked by LastPick (KYC) before their offers go live."],
    ["How do I report a bad offer or business?", "Open the offer and tap Report this offer, or raise a ticket. We review every report."],
    ["When can I get a refund?", "For example a duplicate charge, or money taken for a payment that failed. See the Refund policy in Account."],
    ["How do I raise a complaint?", "Raise a ticket from Account → Complaints. Every ticket gets a number and we resolve it in 1–5 working days."],
  ]],
];

export const PARTNER_FAQ = [
  ["Getting started & KYC", [
    ["What is LastPick Partner?", "The app for local businesses to post same-day offers and reach customers within 30 km."],
    ["How do I register?", "Tap Register your business: add your photo, business type, name, mobile, e-mail and password, then enter the e-mail code."],
    ["Why do you need my photo?", "For KYC. It's seen only by you and the LastPick team, never by customers."],
    ["What does KYC in progress mean?", "Our team is checking your business. You can post offers once it's verified."],
    ["How long does verification take?", "Usually within 1–2 working days. You get an e-mail when your business is approved."],
    ["How do I set my shop location?", "At your shop, tap Detect my shop location. It fills the map point, pincode, city and address automatically."],
  ]],
  ["Posting offers", [
    ["How many offers can I post?", "Up to 3 offers a day, in your own business category."],
    ["When can I post?", "From 4 AM to 10:30 PM. Hotels can post any time (24×7)."],
    ["How long does an offer stay live?", "Offers end by 11 PM the same day and are removed at midnight. Hotels run up to 24 hours."],
    ["Can I post in another category?", "No, you post only in your registered category. You can change it in your business details."],
    ["Do I add photos?", "No. Each offer shows its category icon, which keeps the app fast."],
    ["How is the discount worked out?", "Enter the normal price and the offer price; the % off is calculated for you."],
  ]],
  ["Plans & days left", [
    ["What does Business Pro cost?", `${packs("owner")}. The 30-day pack is just ${perDayBest("owner")} a day.`],
    ["Does it renew automatically?", "No. You pay once for the days you choose. Nothing is charged again unless you pay again."],
    ["How do I see how many days are left?", "At the top of your home screen: Business Pro · N days left."],
    ["Can I add more days?", "Yes, any pack, any number of times. New days are added to your current end date."],
    ["When can I buy Business Pro?", "Once your business is verified."],
  ]],
  ["Leads & reviews", [
    ["Who are interested customers?", "Customers who tapped I'm interested. You see their names; their numbers stay private."],
    ["Can I see views?", "Yes, every offer shows how many customers saw it."],
    ["Can I reply to reviews?", "Yes, open Reviews and reply. Keep replies polite; reviews build your reputation."],
  ]],
  ["Payments & help", [
    ["Do customers pay LastPick for my offer?", "No. Customers pay you directly. LastPick takes no commission on your sales."],
    ["Payment failed but money was taken?", "Raise a ticket or e-mail a clear screenshot of the payment to support@lastpick.in."],
    ["Can I use two phones?", "One device at a time. Logging in on a new device logs out the old one."],
    ["How do I contact LastPick?", "Raise a ticket, or e-mail support@lastpick.in."],
  ]],
];
