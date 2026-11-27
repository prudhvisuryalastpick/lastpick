// Help topics: each one shows instant answers first. Only if they don't help does the person raise a ticket.
// Topic names must match SUPPORT_TOPICS in server/src/routes/support.js.
export const RESPONSE_PROMISE = "We reply within 1–5 business days (Monday to Friday).";

const T = (topic, icon, who, answers) => ({ topic, icon, who, answers });

export const HELP_TOPICS = [
  T("Offer not honoured by the shop", "🏷️", "customer", [
    ["The shop refused the price shown", "Show the offer on your phone at the counter. If they still refuse, open the offer and tap Report. We review every report and can warn, hide or suspend the shop."],
    ["The offer was already over", "Offers end by 11 PM the same day, and a shop can end an offer early when stock runs out. Call before you go: the number is on the offer."],
    ["I paid but didn't get it", "LastPick doesn't take payments for offers; you pay the shop directly. Ask the shop for a refund, report the offer, and raise a ticket below with a photo of the bill."],
  ]),
  T("Shop not answering calls", "📞", "customer", [
    ["Nobody picks up", "Shops are busy at peak hours. Try again in a few minutes, or use WhatsApp if the offer shows it."],
    ["The number is wrong", "Open the offer and tap Report → Wrong number. We check it and fix or hide the offer."],
  ]),
  T("Login or code problem", "🔑", "all", [
    ["I didn't get the code", "Wait 30 seconds and tap Send again. Check your spam folder for e-mail codes. Make sure the e-mail or number is typed correctly."],
    ["I was logged out", "Your account works on one device at a time. Logging in on another phone logs out the old one. Just log in again."],
    ["I changed my phone number", "Log in with your e-mail, then update the number in Account."],
  ]),
  T("Payment or plan", "💳", "all", [
    ["I paid but my plan isn't showing", "Payments can take up to 10 minutes to show. Pull down to refresh, or log out and in again. If it's still missing after 30 minutes, raise a ticket with a screenshot of the payment."],
    ["Money was taken twice", "Duplicate payments are refunded to your account automatically within 5–7 working days. If not, raise a ticket with both payment screenshots."],
    ["How do plans work?", "Plans start today (Day 1) and run till 11:59 PM on the last day. There's no auto-renewal: you choose when to buy again."],
  ]),
  T("Business verification", "✅", "partner", [
    ["How long does verification take?", "Usually within 1 working day after your profile, shop photo and location are complete."],
    ["Why was I rejected?", "The reason is shown on your dashboard. Fix it (for example a clear shop photo or the right licence) and submit again."],
    ["How do I change my category?", "Your category is fixed after registration. Raise a ticket and our team will change it for you."],
  ]),
  T("Posting offers", "📣", "partner", [
    ["How many offers can I post?", "3 posts a day per business, between 4 AM and 10:30 PM. Everything ends by 11 PM. Hotels and local ads can run for up to 24 hours."],
    ["My offer was removed", "Offers outside your category, with fake prices, or for banned items are removed. Check the reason in your dashboard."],
  ]),
  T("Rentals listing", "🏠", "partner", [
    ["How long does a listing stay live?", "15 days (₹249) or 30 days (₹499), from today. It ends by itself; there's no auto-renewal."],
    ["I found a tenant", "Open the listing and tap Rented out. It's hidden at once. You can reopen it within 7 days; after that its photos and video are deleted."],
    ["My video won't upload", "Videos must be 1 minute or shorter and small. See How to make a small video in the listing form."],
  ]),
  T("Location is wrong", "📍", "all", [
    ["The app shows the wrong area", "Tap the location at the top and choose Use my location, or type your pincode. Turn on GPS for the best result."],
    ["My village or pincode isn't found", "Type your pincode. If it still isn't found, raise a ticket with your village, mandal and pincode."],
  ]),
  T("App not working", "🛠️", "all", [
    ["The app is slow or stuck", "Check your internet, then close and reopen the app. Updating to the latest version from the Play Store fixes most problems."],
    ["I see \"Reconnecting…\"", "Your phone lost its connection for a moment. It reconnects by itself; nothing you did is lost."],
  ]),
  T("A customer or lead", "🙋", "partner", [
    ["A customer misbehaved", "Open Leads and tap Report on that customer, or raise a ticket below. Customers who break the rules are blocked."],
  ]),
  T("Safety concern", "🛡️", "all", [
    ["Someone asked for an advance payment", "Never pay an advance to someone you haven't met or verified. Report the offer or listing and raise a ticket. In an emergency, call 112."],
  ]),
  T("Something else", "💬", "all", []),
];

export const topicsFor = (role) => HELP_TOPICS.filter((t) => t.who === "all" || t.who === role);
