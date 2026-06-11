import { redirect } from "next/navigation";

// Manual Delivery has been superseded by the live Marketplace (BuySellVouchers
// mirror). Keep the route alive but send any old links to the new page.
export default function ResellerManualDeliveryRedirect() {
    redirect("/reseller/shop/marketplace");
}
