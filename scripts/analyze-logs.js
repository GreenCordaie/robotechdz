const fs = require('fs');
const content = fs.readFileSync('evo_very_fresh.log', 'utf16le');
const lines = content.split('\n');
console.log(`Analyzing ${lines.length} lines...`);
lines.forEach(line => {
    if (line.toLowerCase().includes('webhook') ||
        line.toLowerCase().includes('upsert') ||
        line.toLowerCase().includes('error')) {
        console.log(line.trim());
    }
});
