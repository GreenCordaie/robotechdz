
[2026-03-23] | God Mode Audit — sécurité | Toujours utiliser crypto.timingSafeEqual() pour comparer des secrets. Ne jamais inclure de credentials (pinCode, token) dans les réponses client. Les fallback keys hardcodées doivent être supprimées, pas gated par NODE_ENV.
[2026-03-23] | God Mode Audit — CSS | Les valeurs hex Tailwind standard (#F9FAFB=gray-50, #F3F4F6=gray-100, #10b981=emerald-500) doivent utiliser les tokens natifs. Les inline <style> dans JSX vont dans globals.css. Les font inline (font-['Inter']) vont dans tailwind.config.
