-- Seed manual_products from historical purchases.
--
-- Sources (priority order — first source with a row wins per title_key):
--   1. order_items + orders          → legacy kiosk + B2B catalog (richest)
--   2. reseller_iptv_orders          → IPTV mirror orders
--   3. g2bulk_orders.won_snapshot    → G2Bulk gift cards / diamond top-ups
--
-- Rules:
--   - Dedup by LOWER(TRIM(title)) within batch + against existing manual_products.title.
--   - Most recent NON-ZERO price wins (DISTINCT ON ordering trick).
--   - Representative title = longest variant of the case-insensitive group.
--   - Skip operational events: 'Inject IPTV%', 'IBO Player — Check MAC'.
--   - Drop items whose every historical price is 0 → flagged anomaly.
--   - sort_order = 10 * frequency rank.
--
-- Run:
--   docker exec -i 100-pc-ia-db-1 psql -U user -d flexbox < scripts/seed-manual-from-history.sql

BEGIN;

-- ====================================================================
-- 1. order_items normalized rows
-- ====================================================================
WITH oi_rows AS (
  SELECT
    LOWER(TRIM(oi.name)) AS title_key,
    oi.name              AS title,
    oi.price             AS price,
    o.created_at         AS created_at
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.name IS NOT NULL
    AND TRIM(oi.name) <> ''
    AND oi.name NOT ILIKE 'Inject IPTV%'
    AND oi.name <> 'IBO Player — Check MAC'
),
oi_agg AS (
  SELECT
    title_key,
    -- representative display title = longest variant
    (ARRAY_AGG(title ORDER BY LENGTH(title) DESC, title))[1] AS title,
    COUNT(*) AS hits
  FROM oi_rows
  GROUP BY title_key
),
oi_price AS (
  SELECT DISTINCT ON (title_key)
    title_key, price AS latest_price
  FROM oi_rows
  WHERE price > 0
  ORDER BY title_key, created_at DESC
),
oi_final AS (
  SELECT a.title_key, a.title, a.hits, p.latest_price
  FROM oi_agg a
  LEFT JOIN oi_price p ON p.title_key = a.title_key
),

-- ====================================================================
-- 2. reseller_iptv_orders
-- ====================================================================
iptv_rows AS (
  SELECT
    LOWER(TRIM(product_name)) AS title_key,
    product_name              AS title,
    price_paid_dzd            AS price,
    created_at                AS created_at
  FROM reseller_iptv_orders
  WHERE product_name IS NOT NULL
    AND TRIM(product_name) <> ''
),
iptv_agg AS (
  SELECT
    title_key,
    (ARRAY_AGG(title ORDER BY LENGTH(title) DESC))[1] AS title,
    COUNT(*) AS hits
  FROM iptv_rows
  GROUP BY title_key
),
iptv_price AS (
  SELECT DISTINCT ON (title_key)
    title_key, price AS latest_price
  FROM iptv_rows
  WHERE price > 0
  ORDER BY title_key, created_at DESC
),
iptv_final AS (
  SELECT a.title_key, a.title, a.hits, p.latest_price
  FROM iptv_agg a
  LEFT JOIN iptv_price p ON p.title_key = a.title_key
),

-- ====================================================================
-- 3. g2bulk_orders won_snapshot.title
-- ====================================================================
g2b_rows AS (
  SELECT
    LOWER(TRIM(won_snapshot->>'title')) AS title_key,
    won_snapshot->>'title'              AS title,
    price_paid_dzd                      AS price,
    created_at                          AS created_at
  FROM g2bulk_orders
  WHERE won_snapshot IS NOT NULL
    AND won_snapshot->>'title' IS NOT NULL
    AND TRIM(won_snapshot->>'title') <> ''
),
g2b_agg AS (
  SELECT
    title_key,
    (ARRAY_AGG(title ORDER BY LENGTH(title) DESC))[1] AS title,
    COUNT(*) AS hits
  FROM g2b_rows
  GROUP BY title_key
),
g2b_price AS (
  SELECT DISTINCT ON (title_key)
    title_key, price AS latest_price
  FROM g2b_rows
  WHERE price > 0
  ORDER BY title_key, created_at DESC
),
g2b_final AS (
  SELECT a.title_key, a.title, a.hits, p.latest_price
  FROM g2b_agg a
  LEFT JOIN g2b_price p ON p.title_key = a.title_key
),

-- ====================================================================
-- Union with priority + category inference
-- ====================================================================
unified AS (
  SELECT title_key, title, hits, latest_price,
         CASE
           WHEN title ILIKE 'IPTV %' OR title ILIKE 'ATLAS PRO%'
             OR title ILIKE 'IRON TV%' OR title ILIKE 'KING365%'
             OR title ILIKE 'LYNX%' THEN 'IPTV'
           WHEN title ILIKE 'IBO Player%' THEN 'Active Code'
           WHEN title ILIKE 'NETFLIX%' OR title ILIKE 'disney%'
             OR title ILIKE 'prim%' OR title ILIKE 'crunchyroll%'
             OR title ILIKE 'Shahid%' OR title ILIKE 'shahid%'
             OR title ILIKE 'spotify%' OR title ILIKE 'tod%'
             OR title ILIKE 'Canva%' OR title ILIKE 'Chat Gpt%'
             OR title ILIKE 'snapchat plus%' THEN 'Streaming'
           WHEN title ILIKE 'FREE FIRE%' OR title ILIKE 'free fire%'
             OR title ILIKE 'PUBG%' OR title ILIKE 'Fortnite%' THEN 'Game Top Up'
           WHEN title ILIKE 'steam%' OR title ILIKE 'STEAM%'
             OR title ILIKE 'ITUNES%' OR title ILIKE 'XBox Gift%'
             OR title ILIKE 'PSN%' OR title ILIKE 'PS plus%'
             OR title ILIKE 'game pass%' THEN 'Gift Cards'
           ELSE 'Other'
         END AS category,
         1 AS prio
  FROM oi_final
  UNION ALL
  SELECT title_key, title, hits, latest_price, 'IPTV' AS category, 2 AS prio
  FROM iptv_final
  UNION ALL
  SELECT title_key, title, hits, latest_price, 'Gift Cards' AS category, 3 AS prio
  FROM g2b_final
),
dedup AS (
  SELECT DISTINCT ON (title_key)
    title_key, title, hits, latest_price, category
  FROM unified
  ORDER BY title_key, prio ASC, hits DESC
),
ready AS (
  SELECT
    title,
    category,
    latest_price AS price_dzd,
    (ROW_NUMBER() OVER (ORDER BY hits DESC, title)) * 10 AS sort_order
  FROM dedup
  WHERE latest_price IS NOT NULL
    AND latest_price > 0
)
INSERT INTO manual_products (title, category, price_dzd, sort_order, is_active, description, image_url)
SELECT
  r.title,
  r.category,
  r.price_dzd,
  r.sort_order,
  TRUE,
  NULL,
  NULL
FROM ready r
WHERE NOT EXISTS (
  SELECT 1 FROM manual_products mp
  WHERE LOWER(TRIM(mp.title)) = LOWER(TRIM(r.title))
);

COMMIT;
