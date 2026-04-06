# Data Model: White-Label Branding Configuration

**Feature**: 011-white-label-branding | **Date**: 2026-03-30

## No Migration Required

All required columns already exist in the `shop_settings` table.

## Entity: BrandingSettings (extends `shopSettings`)

The branding configuration is stored as part of the existing singleton `shopSettings` record.

### Branding Fields

| Column (DB) | Field (ORM) | Type | Default | Validation | Purpose |
|-------------|-------------|------|---------|------------|---------|
| `shop_name` | `shopName` | `text` | `"FLEXBOX DIRECT"` | Non-empty string, max 100 chars | Displayed everywhere instead of hardcoded brand name |
| `accent_color` | `accentColor` | `text` | `"#ec5b13"` | Valid hex color (`#xxx` or `#xxxxxx`) | Applied as `--primary` CSS custom property |
| `logo_url` | `logoUrl` | `text` (nullable) | `null` | Valid URL or null | Logo image for kiosk, admin header, receipt |
| `dashboard_logo_url` | `dashboardLogoUrl` | `text` (nullable) | `null` | Valid URL or null | Separate logo for admin sidebar |
| `favicon_url` | `faviconUrl` | `text` (nullable) | `null` | Valid URL or null | Browser tab icon |

### Existing Schema (src/db/schema.ts — no change needed)

```ts
export const shopSettings = pgTable("shop_settings", {
    id: serial("id").primaryKey(),
    shopName: text("shop_name").default("FLEXBOX DIRECT"),
    // ... other fields ...
    accentColor: text("accent_color").default("#ec5b13"),
    logoUrl: text("logo_url"),
    dashboardLogoUrl: text("dashboard_logo_url"),
    faviconUrl: text("favicon_url"),
    // ... other fields ...
});
```

## Validation Rules

### `accentColor`
- Must match regex: `/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/`
- Validated in `src/app/admin/settings/actions.ts` before persisting
- Already handled by Zod schema in actions — extend to include pattern validation

### `logoUrl` / `faviconUrl`
- Must be a valid URL (starts with `https://` or `http://`) OR empty string (treated as unset)
- Validated in actions via `z.string().url().optional().or(z.literal(''))`

### `shopName`
- Non-empty string when provided
- Maximum 100 characters
- Trimmed of leading/trailing whitespace before persist

## Data Flow

```
DB (shop_settings row)
    ↓
SystemQueries.getSettings()          [server, cached]
    ↓
BrandingInjector (server component)  → <style>:root{--primary: X}</style>  → All SSR pages
    ↓
getShopSettingsAction (server action) → useSettingsStore (Zustand)
    ↓                                              ↓
Kiosk components                    Admin components
(shopName, logoUrl, accentColor)    (shopName, logoUrl, accentColor, faviconUrl)
    ↓                                              ↓
document.documentElement             document.documentElement
.style.setProperty('--primary', X)  .style.setProperty('--primary', X)
```

## Default Values (First-Install Behavior)

When no row exists in `shop_settings`, `SystemQueries.getSettings()` inserts a new row with:
- `shopName`: "FLEXBOX DIRECT" → **will be updated to neutral default during implementation**
- `accentColor`: "#ec5b13" (orange — safe, already what the app looks like)
- `logoUrl`: null → falls back to text shop name display
- `faviconUrl`: null → uses built-in Next.js default favicon

## State Management: `useSettingsStore` Extension

The Zustand store must be extended to include `accentColor`:

```ts
interface SettingsState {
    // existing fields...
    shopName: string;
    logoUrl: string;
    dashboardLogoUrl: string;
    faviconUrl: string;
    // NEW:
    accentColor: string;
}
```

Initial state: `accentColor: "#ec5b13"`

On `fetchSettings()`:
```ts
set({
    // existing...
    accentColor: res.data.accentColor || "#ec5b13",
});
// Apply CSS variable immediately
if (typeof document !== "undefined") {
    document.documentElement.style.setProperty('--primary', res.data.accentColor || "#ec5b13");
}
```
