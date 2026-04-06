const { shopSettings } = require('./src/db/schema');

console.log('Drizzle shopSettings column names:');
Object.entries(shopSettings).forEach(([key, val]) => {
    if (val && val.name) {
        console.log(`${key}: ${val.name}`);
    }
});
