# LastPick on Google Play: listing and upload guide

There are two apps: **LastPick** (customers) and **LastPick Partner** (businesses). Each needs its own Play Store listing.

## Files in this folder

| File | Use in Play Console |
|---|---|
| `customer-icon-512.png` | LastPick → Store listing → App icon |
| `customer-feature-1024x500.png` | LastPick → Store listing → Feature graphic |
| `partner-icon-512.png` | LastPick Partner → App icon |
| `partner-feature-1024x500.png` | LastPick Partner → Feature graphic |
| `lastpick-customer-release` → `app-release.aab` | LastPick → Production / Internal testing → Create release |
| `lastpick-owner-release` → `app-release.aab` | LastPick Partner → Create release |

The two `.aab` files come from GitHub → Actions → **Build Android APKs** → latest run → Artifacts.

**Phone screenshots** (at least 2 per app, up to 8) must be real screenshots of the app. Take them on your phone from the installed APK: Home, an offer, Map and Account for customers; Dashboard, Post an offer and Leads for partners.

---

## App 1: LastPick (customers)

- **Package name:** `in.lastpick.app`
- **App name (max 30):** `LastPick: Deals Near You`
- **Short description (max 80):** `Today's offers from verified shops, hotels, travel and salons within 30 km.`
- **Category:** Shopping. Tags: Deals, Local, Shopping.
- **Full description:**

> LastPick shows you today's best offers from verified local businesses within 30 km of where you are: food before closing, hotel rooms tonight, last-minute bus seats, salon slots, fashion, home appliances, shops, and spare truck space for your goods.
>
> • Real same-day deals: see the normal price, the offer price, the % off and how long the offer lasts.
> • Near you, automatically: LastPick uses your location to show offers within 30 km. No pincode to type.
> • Private: tap "I'm interested" and the business sees only your first name, never your number.
> • Verified businesses only: every business is checked by the LastPick team before it can post.
> • Hotels, travel and logistics run 24×7; other offers run 4 AM – 11 PM and are gone at midnight.
> • Reviews from customers who really contacted the business.
>
> LastPick only connects you with businesses; the deal and payment are between you and the business.
> Customer Pass: ₹99 a month to see businesses' contact numbers.

## App 2: LastPick Partner (businesses)

- **Package name:** `in.lastpick.partner`
- **App name (max 30):** `LastPick Partner`
- **Short description (max 80):** `Post same-day offers and reach customers within 30 km. For verified businesses.`
- **Category:** Business.
- **Full description:**

> Turn today's spare stock, empty rooms, free salon chairs and unsold seats into today's customers.
>
> • Post an offer in 30 seconds: title, normal price, offer price. The % off is worked out for you.
> • Seen by customers within 30 km of your shop, located from your phone's GPS.
> • See how many customers saw each offer, and the names of customers who are interested.
> • Post job openings for your own shop, shown to people nearby.
> • Reply to reviews and build your reputation.
> • Up to 3 posts a day, 4 AM – 10:30 PM. Hotels, travel and logistics can post any time.
>
> Every business is verified by the LastPick team. Business Pro: ₹499 a month.

---

## Answers for Play Console (both apps)

- **Website:** https://lastpick.in
- **Contact e-mail:** support@lastpick.in
- **Privacy policy URL:** https://customer.lastpick.in/#/privacy
- **Account deletion URL:** https://customer.lastpick.in/#/delete-account (in-app: Account → Privacy → Delete account)
- **Ads:** No, the app contains no ads.
- **Target audience:** 18 and over only.
- **Content rating questionnaire:** a shopping and local-business app with user-generated text (offers, reviews) that is moderated, and no violence, gambling or adult content.
- **App access (for Google's reviewers):** the app needs a login. Create a test customer account and a test partner account, and give Google the e-mail and password under App content → App access. Note there that sign-up sends an e-mail and SMS code, so give Google a ready-made test account.
- **Location permission:** used while the app is open to show offers within 30 km (customers) and to set the shop's location (partners). No background location.

### Data safety form

| Data | Collected | Shared | Why |
|---|---|---|---|
| Name | Yes | With a business only when the customer taps "I'm interested" (first name) | Account, app functionality |
| E-mail address | Yes | No | Account, sign-in codes, receipts |
| Phone number | Yes | No (customers' numbers are never shown to businesses) | Account verification (SMS code) |
| Approximate and precise location | Yes, not stored | No | Show offers within 30 km; set the shop's location |
| App interactions (offers opened, interest, reviews) | Yes | No | App functionality, fraud prevention |
| Crash logs | Yes | No | Fix errors |

- Data is encrypted in transit (HTTPS): **Yes**.
- Users can request deletion: **Yes** (in-app, and through the deletion URL above).
- Data is not sold.

---

## Upload steps (one time)

1. **Create the permanent signing key (once):** GitHub → Actions → **Create Android upload key** → Run workflow. Download the artifact `lastpick-upload-key-PRIVATE` (it's kept for 1 day) and follow its README:
   - add the three GitHub secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` (= `lastpick`)
   - keep the files somewhere safe
2. **Build signed bundles:** GitHub → Actions → **Build Android APKs** → Run workflow. Every build gets a higher version number automatically.
3. **Play Console** (https://play.google.com/console, one-time $25 developer fee):
   1. Create the app. Use App signing by Google Play (the default).
   2. Fill in Store listing (text and images above), App content (privacy policy, ads, data safety, content rating, target audience, app access).
   3. Testing → Internal testing → Create release, and upload the `.aab`. Test on a few phones.
   4. Production → Create release, and upload the same `.aab`. Submit for review.
4. Repeat step 3 for the second app.
