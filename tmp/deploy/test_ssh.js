const { Client } = require('ssh2');

const conn = new Client();
console.log('Connecting to VPS...');

conn.on('ready', () => {
    console.log('✅ SSH Connection successful!');
    conn.end();
}).on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
    console.log('Trying keyboard-interactive prompt...');
    finish(['Robotech2026Admin)']);
}).on('error', (err) => {
    console.log('❌ SSH Connection failed: ' + err.message);
}).connect({
    host: '187.124.191.30',
    port: 22,
    username: 'root',
    password: 'Robotech2026',
    tryKeyboard: true,
    readyTimeout: 10000
});
