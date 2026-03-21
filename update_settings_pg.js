const { Client } = require('pg');

async function update() {
    const client = new Client({
        connectionString: 'postgres://user:password@localhost:5435/flexbox', // From .env
    });

    await client.connect();

    try {
        const res = await client.query(`
      UPDATE shop_settings 
      SET telegram_bot_token = $1, 
          telegram_chat_id_admin = $2, 
          telegram_chat_id_caisse = $3, 
          telegram_chat_id_traiteur = $4
      WHERE id = 1
      RETURNING *;
    `, [
            '8654979494:AAFkggRLkgWcNB3tcsXyzFsbPOXRPdlpm7Q',
            '8567482274',
            '8567482274',
            '8567482274'
        ]);

        if (res.rowCount > 0) {
            console.log('Settings updated successfully!');
        } else {
            console.log('Settings table empty or id=1 not found. Inserting default row...');
            await client.query(`
        INSERT INTO shop_settings (id, telegram_bot_token, telegram_chat_id_admin, telegram_chat_id_caisse, telegram_chat_id_traiteur, updated_at) 
        VALUES (1, $1, $2, $3, $4, NOW());
      `, [
                '8654979494:AAFkggRLkgWcNB3tcsXyzFsbPOXRPdlpm7Q',
                '8567482274',
                '8567482274',
                '8567482274'
            ]);
            console.log('Inserted default settings row.');
        }
    } catch (err) {
        console.error('Error updating DB:', err.message);
    } finally {
        await client.end();
    }
}

update();
