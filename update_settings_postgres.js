const postgres = require('postgres');

async function update() {
    const sql = postgres('postgres://user:password@localhost:5435/flexbox'); // From .env

    try {
        const res = await sql`
      UPDATE shop_settings 
      SET telegram_bot_token = '8654979494:AAFkggRLkgWcNB3tcsXyzFsbPOXRPdlpm7Q', 
          telegram_chat_id_admin = '8567482274', 
          telegram_chat_id_caisse = '8567482274', 
          telegram_chat_id_traiteur = '8567482274'
      WHERE id = 1
      RETURNING *;
    `;

        if (res.length > 0) {
            console.log('Settings updated successfully!');
        } else {
            console.log('Settings table empty or id=1 not found. Inserting default row...');
            await sql`
        INSERT INTO shop_settings (id, telegram_bot_token, telegram_chat_id_admin, telegram_chat_id_caisse, telegram_chat_id_traiteur, updated_at) 
        VALUES (
          1, 
          '8654979494:AAFkggRLkgWcNB3tcsXyzFsbPOXRPdlpm7Q', 
          '8567482274', 
          '8567482274', 
          '8567482274', 
          NOW()
        );
      `;
            console.log('Inserted default settings row.');
        }
    } catch (err) {
        console.error('Error updating DB:', err.message);
    } finally {
        await sql.end();
    }
}

update();
