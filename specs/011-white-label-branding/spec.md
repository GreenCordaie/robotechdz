# Feature Specification: White-Label Branding Configuration

**Feature Branch**: `011-white-label-branding`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "White-label de l'application : chaque client peut configurer son logo, nom de boutique, couleur primaire, favicon, et ces éléments apparaissent partout (kiosk, tickets de caisse, WhatsApp messages, admin panel). Configuration depuis /admin/settings. Zéro hardcode de la couleur #ec5b13 ou du nom Flexbox."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Shop Identity (Priority: P1)

An administrator visits `/admin/settings` and fills in the shop's branding: the shop name, the primary color (via a color picker), the logo (URL), and the favicon URL. Upon saving, the entire application immediately reflects the new identity — no restart needed.

**Why this priority**: This is the foundational data layer. Without persisting the branding config, no other story can work. It also directly unblocks the admin panel itself from showing hardcoded values.

**Independent Test**: Navigate to `/admin/settings`, update shop name to "AcmeCorp" and primary color to `#1a73e8`, save — then reload any admin page and verify "AcmeCorp" and the blue color appear in the header/nav, not "Flexbox" and `#ec5b13`.

**Acceptance Scenarios**:

1. **Given** the admin is on `/admin/settings`, **When** they enter a shop name, pick a primary color, provide a logo URL, and click Save, **Then** the settings are persisted and a success confirmation is shown.
2. **Given** valid settings have been saved, **When** the admin panel reloads, **Then** the header displays the configured shop name and primary color instead of hardcoded defaults.
3. **Given** no logo URL is provided, **When** any page loads, **Then** a text-based fallback is shown rather than a broken image.
4. **Given** an invalid hex color value is entered, **When** the admin tries to save, **Then** the form rejects the value with a clear error message and does not persist it.

---

### User Story 2 - Branding in the Kiosk (Priority: P2)

The customer-facing kiosk displays the shop's logo, shop name, and primary color (buttons, accents, loading states) instead of any hardcoded values. A business can white-label the kiosk for their own customers without touching code.

**Why this priority**: The kiosk is the public-facing surface. After identity is configured (US1), the kiosk must reflect it immediately to deliver the white-label promise to end customers.

**Independent Test**: With branding configured (US1 complete), open `/kiosk` and verify the logo, name, and primary color all match the saved settings.

**Acceptance Scenarios**:

1. **Given** branding is configured, **When** a customer opens the kiosk, **Then** the shop logo and name appear in the header/welcome screen.
2. **Given** a primary color is configured, **When** the kiosk renders buttons and interactive elements, **Then** all accent colors use the configured primary color, not `#ec5b13`.
3. **Given** the branding changes in settings, **When** the kiosk is reloaded, **Then** the new branding is visible without any deployment.

---

### User Story 3 - Branding on Thermal Receipts (Priority: P3)

Printed/displayed thermal receipts show the shop name and logo dynamically. No receipt ever shows a hardcoded business name.

**Why this priority**: Receipts are a trust signal. They must match the configured identity for the white-label to be credible to end customers.

**Independent Test**: After configuring shop name "AcmeCorp", trigger an order receipt and verify "AcmeCorp" appears at the top, not "Flexbox".

**Acceptance Scenarios**:

1. **Given** a shop name is configured, **When** a receipt is generated, **Then** the shop name appears in the receipt header.
2. **Given** a logo URL is configured, **When** a receipt is rendered, **Then** the logo image appears on the receipt where layout allows.
3. **Given** no logo is configured, **When** a receipt is generated, **Then** only the shop name text is shown, no broken image placeholder.

---

### User Story 4 - Branding in WhatsApp Notifications (Priority: P3)

WhatsApp delivery messages reference the shop name dynamically. No automated message ever mentions a hardcoded brand name.

**Why this priority**: Same priority as receipts — both are customer-facing documents where the brand identity must be consistent.

**Independent Test**: Configure shop name "AcmeCorp", trigger a WhatsApp order delivery message, verify "AcmeCorp" appears in the message body.

**Acceptance Scenarios**:

1. **Given** a shop name is configured, **When** a WhatsApp delivery notification is sent, **Then** the message references the configured shop name.
2. **Given** the shop name is updated, **When** the next message is sent, **Then** the new name is used immediately (no stale cached name in messages).

---

### User Story 5 - Dynamic Favicon and Browser Tab Title (Priority: P4)

The browser tab for all admin and kiosk pages shows the configured favicon and includes the shop name in the page title.

**Why this priority**: Lower-priority polish — the core white-label works without it, but this completes the professional branded experience.

**Independent Test**: Configure favicon URL and shop name, reload `/admin`, verify the browser tab icon and title match the configured values.

**Acceptance Scenarios**:

1. **Given** a favicon URL is configured, **When** any app page loads, **Then** the browser tab shows the configured favicon.
2. **Given** a shop name is configured, **When** admin pages load, **Then** the document title includes the shop name (e.g., "Dashboard — AcmeCorp").
3. **Given** no favicon URL is set, **When** pages load, **Then** a sensible default favicon is used, no broken tab icon.

---

### Edge Cases

- What happens when the primary color is very light (near white) — text on buttons may become unreadable. The UI should warn or constrain extreme values.
- What happens if the logo URL returns a 404? The layout must not break; fall back to shop name text.
- What happens when settings are not yet configured (first install)? The app must still function with safe built-in defaults.
- What happens when the color picker produces an invalid hex string (e.g., partial input)?
- What happens if the favicon URL points to a non-image resource? Browser handles it gracefully, but the system should not crash.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store shop name, primary color (hex), logo URL, and favicon URL in the existing `shopSettings` configuration store (extending it with new fields).
- **FR-002**: Admin MUST be able to update all white-label fields from `/admin/settings` via a dedicated Branding section.
- **FR-003**: System MUST validate the primary color as a valid CSS hex color code (3 or 6 digit) before persisting.
- **FR-004**: System MUST validate logo URL and favicon URL as valid URLs before persisting; empty/unset values are allowed.
- **FR-005**: System MUST expose the branding configuration to all rendering contexts (admin, kiosk, receipts, WhatsApp templates) without requiring a server restart.
- **FR-006**: All occurrences of the hardcoded color `#ec5b13` in user-facing output MUST be replaced by the dynamic primary color.
- **FR-007**: All occurrences of the hardcoded name "Flexbox" in user-facing output MUST be replaced by the dynamic shop name.
- **FR-008**: The kiosk MUST apply the primary color as a CSS custom property so all themed elements update automatically when the value changes.
- **FR-009**: The thermal receipt component MUST display the configured shop name and logo (if set).
- **FR-010**: WhatsApp message templates MUST inject the configured shop name wherever a brand name appears.
- **FR-011**: The application layout MUST use the configured favicon URL in the HTML `<head>` metadata.
- **FR-012**: Page titles in admin and kiosk MUST include the configured shop name.
- **FR-013**: System MUST provide safe default values (name: "Ma Boutique", color: `#ec5b13`, no logo/favicon) so the app functions before any white-label configuration is saved.

### Key Entities

- **BrandingSettings**: Configuration record extending the existing `shopSettings` store. Adds four fields: `shopName` (display name of the business), `primaryColor` (hex string for accent/button colors), `logoUrl` (absolute URL or null), `faviconUrl` (absolute URL or null). No separate table — these are new columns in the existing settings row.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can update all four branding fields and save in under 60 seconds from opening `/admin/settings`.
- **SC-002**: After saving new branding, 100% of user-facing surfaces (kiosk, receipts, WhatsApp messages, admin header, browser tab) reflect the new values on next page load — no manual deployment required.
- **SC-003**: Zero occurrences of the literal string "Flexbox" or the literal hex value `#ec5b13` remain in any rendered user-facing output after a white-label configuration is applied.
- **SC-004**: The application remains fully functional with no visual regressions when no branding has been configured (first-install / empty-state).
- **SC-005**: Invalid inputs (malformed hex, malformed URL) are rejected before persisting, with clear error feedback — 0% of invalid values reach the database.

## Assumptions

- The existing `shopSettings` table/record is the correct place to store branding fields; adding columns is preferred over creating a new table.
- Logo upload (file upload to storage) is out of scope for this iteration — only URL-based logos are supported. File upload is a future enhancement.
- Multi-tenant isolation (different branding per tenant account) is out of scope — this is a single-shop white-label configuration.
- The primary color is a single hex value; secondary palette, typography, and layout customization are not in scope for this iteration.
- All hardcoded `#ec5b13` and "Flexbox" occurrences targeted are in application source code and message templates, not in historical user-generated data stored in the database.
