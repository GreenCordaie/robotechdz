const fs = require('fs');
const readline = require('readline');

async function processSql() {
    const fileStream = fs.createReadStream('local_data_restore_utf8.sql');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const output = fs.createWriteStream('local_data_critical.sql');

    const tables = ['users', 'categories', 'products', 'product_variants', 'clients', 'suppliers', 'shop_settings'];
    const regex = new RegExp(`^INSERT INTO public\\.(${tables.join('|')})`);

    for await (const line of rl) {
        if (regex.test(line)) {
            output.write(line + '\n');
        }
    }

    output.end();
    console.log('Done extraction');
}

processSql();
