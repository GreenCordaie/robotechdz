const postgres = require('postgres');

async function checkCapabilities() {
    const dbUrl = 'postgres://user:password@localhost:5435/flexbox';
    const sql = postgres(dbUrl);

    try {
        const settings = await sql`SELECT gemini_api_key FROM shop_settings LIMIT 1`;
        if (!settings.length || !settings[0].gemini_api_key) {
            console.error("❌ Key not found in DB");
            return;
        }

        const key = settings[0].gemini_api_key.trim();
        console.log(`🔍 Testing Key: ${key.substring(0, 10)}...`);

        // 1. Try to list models
        const url = `https://generativelanguage.googleapis.com/v1/models?key=${key}`;
        const res = await fetch(url);
        const data = await res.json();

        if (res.status !== 200) {
            console.error(`❌ LIST MODELS FAIL (Status ${res.status}):`, JSON.stringify(data));
        } else {
            console.log("✅ Models found:", data.models?.map(m => m.name).join(', '));

            // 2. Try simple generate content with the first available model
            if (data.models?.length > 0) {
                const firstModel = data.models[0].name;
                console.log(`📡 Trying generation with: ${firstModel}...`);
                const genUrl = `https://generativelanguage.googleapis.com/v1/${firstModel}:generateContent?key=${key}`;
                const genRes = await fetch(genUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }] })
                });
                const genData = await genRes.json();
                console.log(`🎭 Generation Result (${genRes.status}):`, JSON.stringify(genData));
            }
        }
    } catch (e) {
        console.error("🔥 Connectivity Error:", e.message);
    } finally {
        await sql.end();
    }
}

checkCapabilities();
