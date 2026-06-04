import { redirect } from "next/navigation";

// Netflix now lives inside the unified Streaming category. Keep this route as
// a permanent redirect so old links/bookmarks still resolve.
export default function ResellerNetflixRedirect() {
    redirect("/reseller/shop/streaming");
}
