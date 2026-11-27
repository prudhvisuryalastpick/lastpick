package in.lastpick.partner;

// Google Play payments for the LastPick Partner app (Play Billing Library 8).
// JS: Capacitor.Plugins.PlayBilling.buy({ productId, accountId, ref }) and .unfinished().
// The LastPick server checks every purchase with Google before a plan is switched on, then consumes it.

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private PluginCall buyCall;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
    }

    private interface Ready { void run(); }

    private void whenReady(PluginCall call, Ready ready) {
        if (client.isReady()) { ready.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) ready.run();
                else call.reject("Google Play payments aren't available on this phone right now (" + result.getResponseCode() + ").");
            }
            @Override
            public void onBillingServiceDisconnected() { /* reconnects by itself */ }
        });
    }

    private static JSObject purchaseJson(Purchase p) {
        JSObject o = new JSObject();
        o.put("purchaseToken", p.getPurchaseToken());
        List<String> products = p.getProducts();
        o.put("productId", products.isEmpty() ? "" : products.get(0));
        o.put("orderId", p.getOrderId() == null ? "" : p.getOrderId());
        o.put("state", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased"
            : p.getPurchaseState() == Purchase.PurchaseState.PENDING ? "pending" : "unknown");
        String ref = p.getAccountIdentifiers() != null ? p.getAccountIdentifiers().getObfuscatedProfileId() : null;
        o.put("ref", ref == null ? "" : ref);
        return o;
    }

    @PluginMethod
    public void buy(PluginCall call) {
        String productId = call.getString("productId");
        String accountId = call.getString("accountId", "");
        String ref = call.getString("ref", "");
        if (productId == null || productId.isEmpty()) { call.reject("Missing product"); return; }
        if (buyCall != null) { call.reject("A payment is already open"); return; }
        whenReady(call, () -> {
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId).setProductType(BillingClient.ProductType.INAPP).build()))
                .build();
            client.queryProductDetailsAsync(params, (result, details) -> {
                List<ProductDetails> list = details.getProductDetailsList();
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || list == null || list.isEmpty()) {
                    call.reject("This plan isn't available in Google Play yet. Please try again later.");
                    return;
                }
                BillingFlowParams.Builder flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(
                        BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(list.get(0)).build()));
                if (!accountId.isEmpty()) flow.setObfuscatedAccountId(accountId);
                if (!ref.isEmpty()) flow.setObfuscatedProfileId(ref);
                getActivity().runOnUiThread(() -> {
                    call.setKeepAlive(true);
                    buyCall = call;
                    BillingResult launch = client.launchBillingFlow(getActivity(), flow.build());
                    if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        buyCall = null;
                        call.setKeepAlive(false);
                        if (launch.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
                            JSObject o = new JSObject(); o.put("cancelled", true); call.resolve(o);
                        } else call.reject("Couldn't open Google Play payment (" + launch.getResponseCode() + ").");
                    }
                });
            });
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = buyCall;
        buyCall = null;
        if (call == null) return; // finished later: the app picks it up with unfinished() when it opens
        call.setKeepAlive(false);
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            Purchase p = purchases.get(0);
            JSObject o = purchaseJson(p);
            if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) o.put("pending", true);
            call.resolve(o);
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject o = new JSObject(); o.put("cancelled", true); call.resolve(o);
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            // an earlier purchase of this pack wasn't finished yet: the app confirms it, then it can be bought again
            JSObject o = new JSObject(); o.put("pending", true); call.resolve(o);
        } else {
            call.reject("Google Play payment failed (" + code + "). No plan was added.");
        }
    }

    // purchases Google finished that LastPick hasn't confirmed yet (app closed, no internet, UPI done later)
    @PluginMethod
    public void unfinished(PluginCall call) {
        whenReady(call, () -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (result, purchases) -> {
                JSArray arr = new JSArray();
                if (purchases != null) for (Purchase p : purchases) arr.put(purchaseJson(p));
                JSObject o = new JSObject();
                o.put("purchases", arr);
                call.resolve(o);
            }));
    }
}
