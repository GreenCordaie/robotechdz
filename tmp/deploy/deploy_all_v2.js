const { Client } = require('ssh2');

const conn = new Client();
const targetDir = '/var/www/100-pc-ia';
console.log('Connecting to VPS (187.124.191.30) for V2 deployment...');

conn.on('ready', () => {
    console.log('✅ SSH connected. Uploading fixed application wrapper (app.tar.gz)...');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        conn.exec(`mkdir -p ${targetDir}`, (err, stream) => {
            if (err) throw err;
            stream.on('close', () => {
                sftp.fastPut('tmp/deploy/app.tar.gz', `${targetDir}/app.tar.gz`, (err) => {
                    if (err) throw err;
                    console.log('✅ Upload complete. Extracting and running fixed setup...');

                    const setupCmds = `
                        set -e
                        cd ${targetDir}
                        tar -xzf app.tar.gz
                        rm app.tar.gz
                        
                        echo "=> Configuring .env file"
                        cp .env.example .env
                        sed -i 's|DATABASE_URL=.*|DATABASE_URL="postgres://flexbox_user:Robotech2026DbPass!@db:5432/flexbox"|g' .env
                        sed -i 's|REDIS_URL=.*|REDIS_URL="redis://redis:6379"|g' .env
                        sed -i 's|WHATSAPP_API_URL=.*|WHATSAPP_API_URL="http://whatsapp:3000/api"|g' .env
                        sed -i '/DB_PASSWORD/d' .env
                        echo 'DB_PASSWORD="Robotech2026DbPass!"' >> .env
                        sed -i '/NODE_ENV/d' .env
                        echo 'NODE_ENV="production"' >> .env
                        
                        echo "=> Starting DB first to allow build-time access"
                        docker compose -f docker-compose.prod.yml up -d db redis mongo n8n whatsapp
                        echo "Waiting 10s for Postgres to initialize..."
                        sleep 10
                        
                        echo "=> Building Next.js App with DB Connectivity"
                        export DATABASE_URL="postgres://flexbox_user:Robotech2026DbPass!@127.0.0.1:5432/flexbox"
                        docker compose -f docker-compose.prod.yml build app
                        
                        echo "=> Starting App"
                        docker compose -f docker-compose.prod.yml up -d app
                        
                        echo "=> Running Database Migrations"
                        docker compose -f docker-compose.prod.yml exec -T app npm run db:push
                        
                        echo "✅ DEPLOYMENT V2 FINISHED SUCCESSFULLY!"
                    `;

                    conn.exec(setupCmds, { pty: true }, (err, stream2) => {
                        if (err) throw err;
                        stream2.on('close', (code, signal) => {
                            console.log('Remote execution finished with code: ' + code);
                            conn.end();
                        }).on('data', (data) => process.stdout.write(data))
                            .stderr.on('data', (data) => process.stderr.write(data));
                    });
                });
            }).on('data', () => { }).stderr.on('data', () => { });
        });
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
