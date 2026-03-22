const fs = require('fs');
const content = fs.readFileSync('evo_very_fresh.log', 'utf16le');
const lines = content.split('\n');
console.log(`Analyzing ${lines.length} lines for generic message activity...`);
lines.forEach(line => {
    if (line.toLowerCase().includes('message')) {
        console.log(line.trim());
    }
});
