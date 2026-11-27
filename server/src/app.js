// Builds the API routes for one service. Used by the Node server (src/index.js) and Cloudflare Workers (src/worker.js).
import { createRouter } from "./http.js";
import { accountRoutes } from "./routes/account.js";
import { adminRoutes } from "./routes/admin.js";
import { offerRoutes, offerViewRoutes } from "./routes/offers.js";
import { partnerRoutes } from "./routes/partner.js";
import { rentalCustomerRoutes, rentalOwnerRoutes } from "./routes/rentals.js";
import { paymentRoutes } from "./routes/payments.js";
import { statRoutes } from "./routes/stats.js";
import { reviewReadRoutes, reviewRoutes } from "./routes/reviews.js";
import { insightRoutes } from "./routes/insights.js";
import { supportRoutes } from "./routes/support.js";
import { bannerRoutes, boostPartnerRoutes, revenueAdminRoutes } from "./routes/revenue.js";


export function buildRouter(service) {
  const has = (s) => service === "all" || service === s;
  const router = createRouter();
  accountRoutes(router);
  statRoutes(router); // public counts (partners by pincode and in total, customers, newly joined partners)
  offerViewRoutes(router);
  reviewReadRoutes(router);
  if (has("customer")) { offerRoutes(router); reviewRoutes(router); bannerRoutes(router); rentalCustomerRoutes(router); }
  if (has("partner")) { partnerRoutes(router); boostPartnerRoutes(router); rentalOwnerRoutes(router); }
  if (has("admin")) { adminRoutes(router); revenueAdminRoutes(router); }
  if (has("customer") || has("partner")) paymentRoutes(router); // Razorpay: Customer Pass / Business Pro
  insightRoutes(router, { customer: has("customer"), partner: has("partner") });
  supportRoutes(router, { admin: has("admin") });
  return router;
}
