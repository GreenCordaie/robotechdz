import { heroui } from "@heroui/theme";
import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: "#ec5b13",
                    foreground: "#FFFFFF",
                },
                "background-light": "#f8f6f6",
                "background-dark": "#221610",
                "neutral-dark": "#2a1b15",
                "surface-dark": "#1a1614",
                "border-dark": "#2d2622",
                "accent-muted": "#4b2e24",
                whatsapp: {
                    DEFAULT: "#25D366",
                    hover: "#22c35e",
                },
            },
            fontFamily: {
                sans: ["var(--font-public-sans)", "system-ui", "sans-serif"],
            },
            borderRadius: {
                '3xl': '24px',
            },
            boxShadow: {
                'soft': '0 10px 40px -10px rgba(0, 0, 0, 0.1)',
                'soft-dark': '0 10px 40px -10px rgba(0, 0, 0, 0.5)',
            }
        },
    },
    darkMode: "class",
    plugins: [heroui()],
};
export default config;
