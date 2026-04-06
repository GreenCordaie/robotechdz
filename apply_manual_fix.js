const postgres = require('postgres');

const DATABASE_URL = "postgres://user:password@localhost:5435/flexbox";

async function applyFix() {
    const sql = postgres(DATABASE_URL);

    try {
        console.log('Applying missing columns to shop_settings...');
        await sql.unsafe(`
            ALTER TABLE shop_settings
            ADD COLUMN IF NOT EXISTS dashboard_logo_url text,
            ADD COLUMN IF NOT EXISTS telegram_chat_id_admin text,
            ADD COLUMN IF NOT EXISTS telegram_chat_id_caisse text,
            ADD COLUMN IF NOT EXISTS telegram_chat_id_traiteur text,
            ADD COLUMN IF NOT EXISTS whatsapp_api_url text DEFAULT 'http://localhost:3001',
            ADD COLUMN IF NOT EXISTS whatsapp_api_key text,
            ADD COLUMN IF NOT EXISTS whatsapp_instance_name text DEFAULT 'FLEXBOX_BOT',
            ADD COLUMN IF NOT EXISTS whatsapp_sender_number text,
            ADD COLUMN IF NOT EXISTS whatsapp_message_template text,
            ADD COLUMN IF NOT EXISTS chatbot_enabled boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS chatbot_greeting text,
            ADD COLUMN IF NOT EXISTS whatsapp_webhook_url text,
            ADD COLUMN IF NOT EXISTS whatsapp_verify_token text,
            ADD COLUMN IF NOT EXISTS gemini_api_key text,
            ADD COLUMN IF NOT EXISTS chatbot_role text,
            ADD COLUMN IF NOT EXISTS n8n_webhook_url text,
            ADD COLUMN IF NOT EXISTS usd_exchange_rate numeric(10,2) NOT NULL DEFAULT 245.00,
            ADD COLUMN IF NOT EXISTS vapid_public_key text,
            ADD COLUMN IF NOT EXISTS vapid_private_key text,
            ADD COLUMN IF NOT EXISTS stock_alert_threshold integer NOT NULL DEFAULT 5,
            ADD COLUMN IF NOT EXISTS netflix_resolver_email text,
            ADD COLUMN IF NOT EXISTS netflix_resolver_password text,
            ADD COLUMN IF NOT EXISTS microsoft_client_id text,
            ADD COLUMN IF NOT EXISTS microsoft_tenant_id text,
            ADD COLUMN IF NOT EXISTS microsoft_client_secret text,
            ADD COLUMN IF NOT EXISTS microsoft_redirect_uri text;
        `);
        console.log('Columns added successfully.');

        // Re-check columns to see what we have
        const columns = await sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'shop_settings';
        `;

        const columnNames = columns.map(r => r.column_name);
        console.log('Current columns in shop_settings:');
        console.log(columnNames.join(', '));

        if (columnNames.includes('ein')) {
            console.log('Column "ein" exists.');
        } else if (columnNames.includes('cin')) {
            console.log('Column "cin" exists instead of "ein".');
        } else {
            console.log('Neither "ein" nor "cin" found.');
        }

    } catch (err) {
        console.error('Error applying fix:', err.message);
    } finally {
        await sql.end();
    }
}

applyFix();
