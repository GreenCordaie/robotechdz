const fs = require('fs');
const readline = require('readline');

async function applySql() {
    const content = fs.readFileSync('local_data_critical.sql', 'utf-8');
    const lines = content.split('\n');

    // Group by table to ensure order or just run in order of extraction
    // Extracting in the order they appear is usually safe if the dump is standard.
    // In our case, the extraction was sequential from the dump.

    // I'll group them by table just to be sure.
    const tables = ['users', 'categories', 'products', 'product_variants', 'clients', 'suppliers', 'shop_settings'];
    const grouped = {};
    tables.forEach(t => grouped[t] = []);

    lines.forEach(line => {
        for (const t of tables) {
            if (line.startsWith(`INSERT INTO public.${t}`)) {
                grouped[t].push(line);
                break;
            }
        }
    });

    // Print them in order
    for (const t of tables) {
        if (grouped[t].length > 0) {
            console.log(`-- Table: ${t}`);
            console.log(grouped[t].join('\n'));
            console.log(';\n');
        }
    }
}

applySql();
