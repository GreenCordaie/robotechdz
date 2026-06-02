import { redirect } from "next/navigation";

/**
 * /reseller/orders is now folded into the unified wallet hub.
 * Keep this route alive so old bookmarks + the topnav dropdown still
 * land users on the right tab.
 */
export default function ResellerOrdersRedirect() {
    redirect("/reseller/wallet?tab=orders");
}
