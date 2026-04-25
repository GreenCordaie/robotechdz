const { Client } = require('ssh2');

const conn = new Client();
console.log('Connecting to VPS (187.124.191.30) to check build logs...');

conn.on('ready', () => {
    console.log('✅ SSH connected. Running build diagnostic...');
    const cmd = `
        cd /var/www/100-pc-ia
        export DATABASE_URL_BUILD="postgres://flexbox_user:Robotech2026DbPass!@127.0.0.1:5432/flexbox"
        docker compose -f docker-compose.prod.yml build --no-cache --progress plain app
    `;
    conn.exec(cmd, { pty: true }, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Diagnostic finished with code: ' + code);
            conn.end();
        }).on('data', (data) => process.stdout.write(data))
            .stderr.on('data', (data) => process.stderr.write(data));
    });
}).on('error', (err) => {
    console.log('❌ SSH Error: ' + err.message);
}).connect({
    host: '187.124.191.30',
    port: 22,
    username: 'root',
    password: 'Robotech2026',
    tryKeyboard: true,
    readyTimeout: 10000
});
