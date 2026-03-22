/**
 * Seed script: 20 test products + suppliers + codes/slots + transactions
 * Run: node scripts/seed-products.js
 */
const postgres = require('postgres');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5435/flexbox';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || null;
const DEFAULT_KEY = 'fallback_key_for_dev_only_32_chars';

const sql = postgres(DATABASE_URL);

// ── Encryption (mirrors src/lib/encryption.ts) ─────────────────────────────
function encrypt(text) {
    if (!text) return text;
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY || DEFAULT_KEY).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}.${authTag}.${encrypted}`;
}

// ── Random code generators ─────────────────────────────────────────────────
function rndCode(prefix = '', len = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < len; i++) {
        if (i > 0 && i % 4 === 0) s += '-';
        s += chars[Math.floor(Math.random() * chars.length)];
    }
    return prefix ? `${prefix}-${s}` : s;
}

function rndEmail(name) {
    const domains = ['gmail.com', 'yahoo.fr', 'hotmail.com', 'outlook.fr'];
    return `${name.toLowerCase().replace(/ /g, '.')}@${domains[Math.floor(Math.random() * domains.length)]}`;
}

function rndPhone() {
    return '07' + String(Math.floor(Math.random() * 90000000) + 10000000);
}

async function main() {
    console.log('🌱 Starting seed...\n');

    // ── 1. Categories ──────────────────────────────────────────────────────
    console.log('📁 Inserting categories...');
    const cats = await sql`
        INSERT INTO categories (name, icon) VALUES
            ('Streaming & VOD',   'streaming'),
            ('Gaming',            'gaming'),
            ('Outils & Logiciels','tools'),
            ('VPN & Sécurité',    'vpn'),
            ('Comptes Partagés',  'sharing')
        ON CONFLICT DO NOTHING
        RETURNING id, name
    `;
    const catMap = Object.fromEntries(cats.map(c => [c.name, c.id]));
    console.log('  ✓', cats.length, 'categories');

    // ── 2. Suppliers ───────────────────────────────────────────────────────
    console.log('🏭 Inserting suppliers...');
    const supRows = await sql`
        INSERT INTO suppliers (name, balance, currency, status) VALUES
            ('StreamPro Distribution',  '1250.00', 'USD', 'ACTIVE'),
            ('GamingKeys MENA',         '87500.00','DZD', 'ACTIVE'),
            ('SoftVault International', '480.00',  'USD', 'ACTIVE'),
            ('SecureNet Supply',        '320.00',  'USD', 'ACTIVE'),
            ('ShopStock DZ',            '45000.00','DZD', 'ACTIVE')
        ON CONFLICT DO NOTHING
        RETURNING id, name
    `;
    const supMap = Object.fromEntries(supRows.map(s => [s.name, s.id]));
    console.log('  ✓', supRows.length, 'suppliers');

    // ── 3. Products & Variants ─────────────────────────────────────────────
    console.log('📦 Inserting products & variants...');

    const products = [
        // ── Streaming ──────────────────────────────────────────────────────
        {
            name: 'Netflix Premium',
            description: 'Abonnement Netflix qualité UHD 4K, accès illimité à tous les contenus.',
            categoryName: 'Streaming & VOD',
            imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg',
            tutorialText: '1. Allez sur netflix.com\n2. Cliquez "Se connecter"\n3. Entrez les identifiants reçus\n4. Profitez !',
            variants: [
                { name: '1 Mois', salePriceDzd: '1800.00', supplier: 'StreamPro Distribution', purchasePriceUsd: '5.50', isSharing: false },
                { name: '3 Mois', salePriceDzd: '4800.00', supplier: 'StreamPro Distribution', purchasePriceUsd: '15.00', isSharing: false },
            ]
        },
        {
            name: 'Netflix Premium (Partagé)',
            description: 'Profil Netflix partagé, accès à 1 profil sur un compte Premium.',
            categoryName: 'Comptes Partagés',
            tutorialText: '1. Ouvrez Netflix\n2. Choisissez votre profil\n3. Regardez en 4K',
            variants: [
                { name: '1 Mois – 1 Profil', salePriceDzd: '550.00', supplier: 'StreamPro Distribution', purchasePriceUsd: '1.50', isSharing: true, totalSlots: 4 },
            ]
        },
        {
            name: 'Spotify Premium',
            description: 'Écoute illimitée sans pub, téléchargements hors-ligne, qualité audio HD.',
            categoryName: 'Streaming & VOD',
            tutorialText: '1. Ouvrez Spotify\n2. Se connecter avec le compte fourni\n3. Profitez de la musique',
            variants: [
                { name: '1 Mois', salePriceDzd: '900.00', supplier: 'StreamPro Distribution', purchasePriceUsd: '2.80', isSharing: false },
                { name: '3 Mois', salePriceDzd: '2400.00', supplier: 'StreamPro Distribution', purchasePriceUsd: '7.50', isSharing: false },
            ]
        },
        {
            name: 'Disney+ Standard',
            description: 'Accès complet à Disney+, Marvel, Star Wars, Pixar et National Geographic.',
            categoryName: 'Streaming & VOD',
            tutorialText: '1. Allez sur disneyplus.com\n2. Cliquez "Connexion"\n3. Entrez les identifiants',
            variants: [
                { name: '1 Mois', salePriceDzd: '1200.00', supplier: 'StreamPro Distribution', purchasePriceUsd: '3.50', isSharing: false },
            ]
        },
        {
            name: 'Canva Pro',
            description: 'Accès complet à Canva Pro : templates premium, images libres de droits, suppression d\'arrière-plan.',
            categoryName: 'Outils & Logiciels',
            tutorialText: '1. Allez sur canva.com\n2. Connectez-vous avec les identifiants\n3. Profitez de Canva Pro',
            variants: [
                { name: '1 Mois', salePriceDzd: '1500.00', supplier: 'SoftVault International', purchasePriceUsd: '4.00', isSharing: false },
                { name: '1 An',   salePriceDzd: '12000.00', supplier: 'SoftVault International', purchasePriceUsd: '32.00', isSharing: false },
            ]
        },
        // ── Gaming ─────────────────────────────────────────────────────────
        {
            name: 'PlayStation Network (PSN)',
            description: 'Crédit PSN pour le PlayStation Store – jouez, téléchargez, abonnez-vous.',
            categoryName: 'Gaming',
            tutorialText: '1. Allez dans le PS Store\n2. Choisissez "Racheter un code"\n3. Entrez votre code',
            variants: [
                { name: '10 USD', salePriceDzd: '3000.00', supplier: 'GamingKeys MENA', purchasePriceDzd: '2600.00', isSharing: false },
                { name: '25 USD', salePriceDzd: '7000.00', supplier: 'GamingKeys MENA', purchasePriceDzd: '6200.00', isSharing: false },
                { name: '50 USD', salePriceDzd: '13000.00',supplier: 'GamingKeys MENA', purchasePriceDzd: '11500.00',isSharing: false },
            ]
        },
        {
            name: 'Xbox Game Pass Ultimate',
            description: 'Accès à plus de 100 jeux Xbox, PC et Cloud Gaming.',
            categoryName: 'Gaming',
            tutorialText: '1. Ouvrez Xbox/PC\n2. Allez dans "Racheter un code"\n3. Entrez le code',
            variants: [
                { name: '1 Mois', salePriceDzd: '2500.00', supplier: 'GamingKeys MENA', purchasePriceDzd: '2100.00', isSharing: false },
                { name: '3 Mois', salePriceDzd: '7000.00', supplier: 'GamingKeys MENA', purchasePriceDzd: '5900.00', isSharing: false },
            ]
        },
        {
            name: 'Free Fire Diamants',
            description: 'Recharge de diamants Free Fire, livraison instantanée sur votre compte.',
            categoryName: 'Gaming',
            requiresPlayerId: true,
            tutorialText: '⚠️ Votre Player ID Free Fire sera demandé lors de la commande.\n1. Lancez Free Fire\n2. Tapotez votre avatar → votre ID s\'affiche\n3. Commandez ici, la recharge arrive en quelques minutes',
            variants: [
                { name: '100 Diamants',  salePriceDzd: '500.00',  supplier: 'GamingKeys MENA', purchasePriceDzd: '420.00', isSharing: false },
                { name: '310 Diamants',  salePriceDzd: '1400.00', supplier: 'GamingKeys MENA', purchasePriceDzd: '1200.00',isSharing: false },
                { name: '520 Diamants',  salePriceDzd: '2200.00', supplier: 'GamingKeys MENA', purchasePriceDzd: '1900.00',isSharing: false },
            ]
        },
        {
            name: 'PUBG UC (Unknown Cash)',
            description: 'Recharge UC pour PUBG Mobile.',
            categoryName: 'Gaming',
            requiresPlayerId: true,
            tutorialText: '⚠️ Votre Player ID PUBG sera demandé.\n1. Lancez PUBG Mobile\n2. Profil → ID du joueur\n3. La recharge arrive après confirmation',
            variants: [
                { name: '60 UC',  salePriceDzd: '300.00',  supplier: 'GamingKeys MENA', purchasePriceDzd: '250.00', isSharing: false },
                { name: '300 UC', salePriceDzd: '1400.00', supplier: 'GamingKeys MENA', purchasePriceDzd: '1200.00',isSharing: false },
                { name: '600 UC', salePriceDzd: '2700.00', supplier: 'GamingKeys MENA', purchasePriceDzd: '2300.00',isSharing: false },
            ]
        },
        {
            name: 'Steam Wallet',
            description: 'Carte cadeau Steam, utilisable pour tous les jeux et DLC sur Steam.',
            categoryName: 'Gaming',
            tutorialText: '1. Ouvrez Steam\n2. "Compte" → "Ajouter des fonds"\n3. Choisissez "Racheter sur Steam"\n4. Entrez le code',
            variants: [
                { name: '10 USD', salePriceDzd: '3000.00', supplier: 'GamingKeys MENA', purchasePriceDzd: '2650.00', isSharing: false },
                { name: '20 USD', salePriceDzd: '5800.00', supplier: 'GamingKeys MENA', purchasePriceDzd: '5100.00', isSharing: false },
            ]
        },
        // ── Outils & Logiciels ─────────────────────────────────────────────
        {
            name: 'Microsoft Office 365',
            description: 'Suite Office complète (Word, Excel, PowerPoint, Outlook, Teams, OneDrive 1 TB).',
            categoryName: 'Outils & Logiciels',
            tutorialText: '1. Allez sur microsoft365.com\n2. Connectez-vous avec les identifiants\n3. Installez les applications',
            variants: [
                { name: '1 Mois',  salePriceDzd: '1500.00',  supplier: 'SoftVault International', purchasePriceUsd: '4.00',  isSharing: false },
                { name: '1 An',    salePriceDzd: '16000.00', supplier: 'SoftVault International', purchasePriceUsd: '44.00', isSharing: false },
            ]
        },
        {
            name: 'Adobe Creative Cloud',
            description: 'Accès à toute la suite Adobe : Photoshop, Premiere, Illustrator, After Effects...',
            categoryName: 'Outils & Logiciels',
            tutorialText: '1. Installez Adobe Creative Cloud\n2. Connectez-vous avec les identifiants fournis\n3. Installez les apps de votre choix',
            variants: [
                { name: '1 Mois', salePriceDzd: '3500.00', supplier: 'SoftVault International', purchasePriceUsd: '9.50', isSharing: false },
            ]
        },
        {
            name: 'ChatGPT Plus',
            description: 'Abonnement ChatGPT Plus (GPT-4o, DALL·E, accès prioritaire).',
            categoryName: 'Outils & Logiciels',
            tutorialText: '1. Allez sur chat.openai.com\n2. Se connecter avec le compte fourni\n3. Activez Plus depuis le compte',
            variants: [
                { name: '1 Mois', salePriceDzd: '5500.00', supplier: 'SoftVault International', purchasePriceUsd: '15.00', isSharing: false },
            ]
        },
        // ── VPN & Sécurité ─────────────────────────────────────────────────
        {
            name: 'NordVPN',
            description: 'VPN premium avec 6 000+ serveurs dans 60+ pays, protection avancée.',
            categoryName: 'VPN & Sécurité',
            tutorialText: '1. Téléchargez NordVPN sur votre appareil\n2. Connectez-vous avec les identifiants\n3. Choisissez un serveur et connectez',
            variants: [
                { name: '1 Mois', salePriceDzd: '2000.00', supplier: 'SecureNet Supply', purchasePriceUsd: '5.50', isSharing: false },
                { name: '1 An',   salePriceDzd: '8500.00', supplier: 'SecureNet Supply', purchasePriceUsd: '23.00', isSharing: false },
            ]
        },
        {
            name: 'ExpressVPN',
            description: 'VPN ultra-rapide, serveurs dans 105 pays, streaming et téléchargements illimités.',
            categoryName: 'VPN & Sécurité',
            tutorialText: '1. Installez ExpressVPN\n2. Connectez-vous\n3. Activez avec le code de licence fourni',
            variants: [
                { name: '1 Mois', salePriceDzd: '2500.00', supplier: 'SecureNet Supply', purchasePriceUsd: '7.00', isSharing: false },
            ]
        },
        // ── Comptes Partagés ───────────────────────────────────────────────
        {
            name: 'Spotify Premium (Partagé)',
            description: 'Accès à un profil Spotify Premium partagé, qualité HD sans pub.',
            categoryName: 'Comptes Partagés',
            tutorialText: '1. Ouvrez Spotify\n2. Entrez les identifiants fournis\n3. Musique illimitée !',
            variants: [
                { name: '1 Mois – 1 Profil', salePriceDzd: '350.00', supplier: 'ShopStock DZ', purchasePriceDzd: '280.00', isSharing: true, totalSlots: 5 },
            ]
        },
        {
            name: 'Disney+ (Partagé)',
            description: 'Profil Disney+ partagé sur un compte Standard.',
            categoryName: 'Comptes Partagés',
            tutorialText: '1. Allez sur disneyplus.com\n2. Connexion avec les identifiants\n3. Choisissez votre profil',
            variants: [
                { name: '1 Mois – 1 Profil', salePriceDzd: '450.00', supplier: 'ShopStock DZ', purchasePriceDzd: '350.00', isSharing: true, totalSlots: 4 },
            ]
        },
        {
            name: 'Canva Pro (Partagé)',
            description: 'Accès à un compte Canva Pro partagé en équipe.',
            categoryName: 'Comptes Partagés',
            tutorialText: '1. Allez sur canva.com\n2. Connectez-vous avec les identifiants\n3. Accès Pro complet',
            variants: [
                { name: '1 Mois – 1 Slot', salePriceDzd: '600.00', supplier: 'ShopStock DZ', purchasePriceDzd: '480.00', isSharing: true, totalSlots: 3 },
            ]
        },
        {
            name: 'Xbox Game Pass (Partagé)',
            description: 'Profil partagé Xbox Game Pass Ultimate — 100+ jeux disponibles.',
            categoryName: 'Comptes Partagés',
            tutorialText: '1. Connectez-vous sur Xbox/PC avec les identifiants\n2. Accédez à Game Pass via le compte principal\n3. Lancez vos jeux',
            variants: [
                { name: '1 Mois – 1 Profil', salePriceDzd: '1200.00', supplier: 'ShopStock DZ', purchasePriceDzd: '950.00', isSharing: true, totalSlots: 2 },
            ]
        },
        {
            name: 'YouTube Premium',
            description: 'YouTube sans pub, téléchargements offline, YouTube Music inclus.',
            categoryName: 'Streaming & VOD',
            tutorialText: '1. Connectez-vous sur YouTube avec les identifiants\n2. Profitez de YouTube Premium',
            variants: [
                { name: '1 Mois', salePriceDzd: '1000.00', supplier: 'StreamPro Distribution', purchasePriceUsd: '2.80', isSharing: false },
                { name: '1 Mois – Partagé', salePriceDzd: '400.00', supplier: 'ShopStock DZ', purchasePriceDzd: '320.00', isSharing: true, totalSlots: 5 },
            ]
        },
    ];

    let totalProducts = 0;
    let totalVariants = 0;
    let totalCodes = 0;
    let totalSlotParents = 0;
    let totalSlots = 0;

    for (const p of products) {
        const catId = catMap[p.categoryName];
        if (!catId) { console.warn(`  ⚠️  Category not found: ${p.categoryName}`); continue; }

        // Insert product
        const [prod] = await sql`
            INSERT INTO products (category_id, name, description, image_url, requires_player_id, is_manual_delivery, status, tutorial_text)
            VALUES (${catId}, ${p.name}, ${p.description || null}, ${p.imageUrl || null}, ${p.requiresPlayerId || false}, false, 'ACTIVE', ${p.tutorialText || null})
            RETURNING id
        `;
        totalProducts++;

        for (const v of p.variants) {
            const [variant] = await sql`
                INSERT INTO product_variants (product_id, name, sale_price_dzd, stock_status, is_sharing, total_slots)
                VALUES (${prod.id}, ${v.name}, ${v.salePriceDzd}, true, ${v.isSharing}, ${v.totalSlots || 1})
                RETURNING id
            `;
            totalVariants++;

            // Link to supplier
            const supId = supMap[v.supplier];
            if (supId) {
                const purchasePrice = v.purchasePriceUsd || null;
                const purchasePriceDzd = v.purchasePriceDzd || null;
                const currency = v.purchasePriceUsd ? 'USD' : 'DZD';
                const price = purchasePrice || purchasePriceDzd || '0';
                await sql`
                    INSERT INTO product_variant_suppliers (variant_id, supplier_id, purchase_price, currency)
                    VALUES (${variant.id}, ${supId}, ${price}, ${currency})
                    ON CONFLICT DO NOTHING
                `;
            }

            if (!v.isSharing) {
                // ── Standard codes: 5 per variant ──────────────────────────
                for (let i = 0; i < 5; i++) {
                    const rawCode = rndCode(p.name.substring(0, 3).toUpperCase());
                    const encryptedCode = encrypt(rawCode);
                    await sql`
                        INSERT INTO digital_codes (variant_id, code, status, is_debit_completed)
                        VALUES (${variant.id}, ${encryptedCode}, 'DISPONIBLE', false)
                    `;
                    totalCodes++;
                }
            } else {
                // ── Shared account: 2 parent codes, each with totalSlots ───
                const slots = v.totalSlots || 4;
                for (let acc = 0; acc < 2; acc++) {
                    const parentEmail = rndEmail(`${p.name.replace(/[^a-zA-Z]/g, '').toLowerCase()}${acc + 1}`);
                    const parentPass = `Flex@${Math.random().toString(36).substring(2, 10)}`;
                    const encParent = encrypt(`${parentEmail}:${parentPass}`);
                    const [dc] = await sql`
                        INSERT INTO digital_codes (variant_id, code, status, is_debit_completed)
                        VALUES (${variant.id}, ${encParent}, 'DISPONIBLE', false)
                        RETURNING id
                    `;
                    totalSlotParents++;
                    for (let s = 1; s <= slots; s++) {
                        const pin = Math.random() < 0.5 ? String(Math.floor(1000 + Math.random() * 9000)) : null;
                        const encPin = pin ? encrypt(pin) : null;
                        await sql`
                            INSERT INTO digital_code_slots (digital_code_id, slot_number, profile_name, code, status)
                            VALUES (${dc.id}, ${s}, ${`Profil ${s}`}, ${encPin}, 'DISPONIBLE')
                        `;
                        totalSlots++;
                    }
                }
            }
        }
        process.stdout.write(`  ✓ ${p.name}\n`);
    }

    // ── 4. Supplier transactions (history) ─────────────────────────────────
    console.log('\n💰 Inserting supplier transactions...');

    // Check if supplier_transactions table exists and what columns it has
    const tableInfo = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'supplier_transactions'
        ORDER BY ordinal_position
    `;
    const colNames = tableInfo.map(r => r.column_name);
    console.log('  Columns:', colNames.join(', '));

    if (colNames.length > 0) {
        const txData = [
            { supName: 'StreamPro Distribution', type: 'RECHARGE',    amount: '500.00',  currency: 'USD', reason: 'Recharge initiale' },
            { supName: 'StreamPro Distribution', type: 'DEBIT',       amount: '-120.00', currency: 'USD', reason: 'Achat codes Netflix ×40' },
            { supName: 'StreamPro Distribution', type: 'DEBIT',       amount: '-80.00',  currency: 'USD', reason: 'Achat codes Spotify ×30' },
            { supName: 'GamingKeys MENA',         type: 'RECHARGE',    amount: '50000.00',currency: 'DZD', reason: 'Recharge principale' },
            { supName: 'GamingKeys MENA',         type: 'DEBIT',       amount: '-8500.00',currency: 'DZD', reason: 'Achat clés PSN ×20' },
            { supName: 'GamingKeys MENA',         type: 'DEBIT',       amount: '-4000.00',currency: 'DZD', reason: 'Achat UC PUBG ×15' },
            { supName: 'SoftVault International', type: 'RECHARGE',    amount: '300.00',  currency: 'USD', reason: 'Recharge SoftVault' },
            { supName: 'SoftVault International', type: 'DEBIT',       amount: '-60.00',  currency: 'USD', reason: 'Achat Canva Pro ×15' },
            { supName: 'SecureNet Supply',         type: 'RECHARGE',    amount: '200.00',  currency: 'USD', reason: 'Recharge VPN' },
            { supName: 'ShopStock DZ',             type: 'RECHARGE',    amount: '25000.00',currency: 'DZD', reason: 'Recharge ShopStock' },
            { supName: 'ShopStock DZ',             type: 'DEBIT',       amount: '-5600.00',currency: 'DZD', reason: 'Achat comptes partagés ×20' },
        ];

        let txCount = 0;
        for (const tx of txData) {
            const supId = supMap[tx.supName];
            if (!supId) continue;
            try {
                const days = Math.floor(Math.random() * 30);
                await sql`
                    INSERT INTO supplier_transactions (supplier_id, type, amount, currency, reason, payment_status, created_at)
                    VALUES (${supId}, ${tx.type}, ${tx.amount}, ${tx.currency}, ${tx.reason}, 'PAID', NOW() - (${days} || ' days')::interval)
                `;
                txCount++;
            } catch (e) {
                console.warn(`  ⚠️  Transaction insert failed: ${e.message}`);
            }
        }
        console.log(`  ✓ ${txCount} transactions`);
    } else {
        console.log('  ⚠️  Table supplier_transactions not found, skipping');
    }

    // ── 5. Test clients ─────────────────────────────────────────────────────
    console.log('\n👥 Inserting test clients...');
    const clientData = [
        { nom: 'Youcef Benali',     tel: '0781480740' },
        { nom: 'Amira Meziani',     tel: '0770123456' },
        { nom: 'Karim Boudjelal',   tel: '0661987654' },
        { nom: 'Nadia Ouahrani',    tel: '0555234567' },
        { nom: 'Mohamed Cherif',    tel: '0790456789' },
    ];
    let clientCount = 0;
    for (const c of clientData) {
        try {
            await sql`
                INSERT INTO clients (nom_complet, telephone, total_spent_dzd, loyalty_points)
                VALUES (${c.nom}, ${c.tel}, '0.00', 0)
            `;
            clientCount++;
        } catch (e) {
            // Ignore duplicates
        }
    }
    console.log(`  ✓ ${clientCount} clients`);

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log('\n✅ Seed completed!');
    console.log(`   Products  : ${totalProducts}`);
    console.log(`   Variants  : ${totalVariants}`);
    console.log(`   Std codes : ${totalCodes}`);
    console.log(`   Shared acc: ${totalSlotParents} (${totalSlots} slots total)`);
    console.log(`   Clients   : ${clientCount}`);

    await sql.end();
}

main().catch(async (err) => {
    console.error('❌ Seed failed:', err);
    await sql.end();
    process.exit(1);
});
