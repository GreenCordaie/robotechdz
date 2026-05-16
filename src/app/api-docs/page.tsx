import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "API Documentation — FLEXBOX DIRECT",
    description: "Documentation publique de l'API et des webhooks sortants pour partenaires.",
};

export const dynamic = "force-static";

/**
 * Page publique de documentation API.
 * Utilise Stoplight Elements via CDN — aucune dépendance npm ajoutée.
 * La spec est servie depuis /openapi.yaml (statique).
 */
export default function ApiDocsPage() {
    return (
        <html lang="fr">
            <head>
                <link
                    rel="stylesheet"
                    href="https://unpkg.com/@stoplight/elements@8/styles.min.css"
                />
                <link rel="icon" href="/favicon.ico" />
            </head>
            <body style={{ margin: 0, padding: 0, fontFamily: "system-ui, sans-serif" }}>
                <div
                    style={{
                        padding: "1.5rem 2rem",
                        background: "#0f0d0c",
                        color: "#fff",
                        borderBottom: "1px solid #2d2622",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "1rem",
                    }}
                >
                    <div>
                        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 900 }}>
                            FLEXBOX DIRECT — API Partenaires
                        </h1>
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#94a3b8" }}>
                            Endpoints REST + webhooks sortants pour intégration boutique / bot / automation
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                        <a
                            href="/openapi.yaml"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                background: "#161616",
                                color: "#ec5b13",
                                padding: "0.5rem 1rem",
                                borderRadius: "0.5rem",
                                textDecoration: "none",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                border: "1px solid #2d2622",
                            }}
                            data-testid="openapi-yaml-link"
                        >
                            Télécharger openapi.yaml
                        </a>
                        <a
                            href="/reseller/login"
                            style={{
                                background: "#ec5b13",
                                color: "#fff",
                                padding: "0.5rem 1rem",
                                borderRadius: "0.5rem",
                                textDecoration: "none",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                            }}
                        >
                            Espace revendeur
                        </a>
                    </div>
                </div>

                {/* Stoplight Elements custom element */}
                <div data-testid="api-docs-container">
                    {/* eslint-disable-next-line @next/next/no-sync-scripts */}
                    <script
                        src="https://unpkg.com/@stoplight/elements@8/web-components.min.js"
                        defer
                    />
                    {/* @ts-expect-error — custom element from CDN */}
                    <elements-api
                        apiDescriptionUrl="/openapi.yaml"
                        router="hash"
                        layout="sidebar"
                        tryItCredentialsPolicy="omit"
                    />
                </div>
            </body>
        </html>
    );
}
