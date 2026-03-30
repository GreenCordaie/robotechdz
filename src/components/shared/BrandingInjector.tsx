import "server-only";
import { SystemQueries } from "@/services/queries/system.queries";

/**
 * Server component — injects the shop's primary color as a CSS custom property
 * into the HTML root, preventing flash of unstyled content on server-rendered pages.
 * Must be rendered inside <head> in the root layout.
 */
export async function BrandingInjector() {
    const settings = await SystemQueries.getSettings();
    const color = settings?.accentColor || "#ec5b13";
    const css = `:root { --primary: ${color}; }`;
    return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
