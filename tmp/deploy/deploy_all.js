const { Client } = require('ssh2');

const conn = new Client();
const targetDir = '/var/www/100-pc-ia';
console.log('Connecting to VPS (187.124.191.30)...');

conn.on('ready', () => {
    console.log('✅ SSH connected. Uploading application wrapper (app.tar.gz)...');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        conn.exec(`mkdir -p ${targetDir}`, (err, stream) => {
            if (err) throw err;
            stream.on('close', () => {
                sftp.fastPut('tmp/deploy/app.tar.gz', `${targetDir}/app.tar.gz`, (err) => {
                    if (err) throw err;
                    console.log('✅ Upload complete. Extracting files and running setup...');

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
                        sed -i '/NEXT_PUBLIC_APP_URL/d' .env
                        echo 'NEXT_PUBLIC_APP_URL="http://187.124.191.30"' >> .env
                        
                        echo "=> Checking Docker"
                        if ! command -v docker &> /dev/null; then
                            echo "Installing Docker..."
                            curl -fsSL https://get.docker.com -o get-docker.sh
                            sh get-docker.sh
                        fi
                        
                        echo "=> Configuring Nginx"
                        apt update > /dev/null
                        DEBIAN_FRONTEND=noninteractive apt install -y nginx > /dev/null
                        cat << 'EOF' > /etc/nginx/sites-available/100-pc-ia
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
    }
}
EOF
                        ln -sf /etc/nginx/sites-available/100-pc-ia /etc/nginx/sites-enabled/
                        rm -f /etc/nginx/sites-enabled/default
                        nginx -t && systemctl reload nginx
                        
                        echo "=> Starting Docker Compose"
                        docker compose -f docker-compose.prod.yml up -d --build
                        
                        echo "=> Running Database Migrations"
                        # Attendre un peu que la DB démarre
                        sleep 5
                        docker compose -f docker-compose.prod.yml exec -T app npm run db:push
                        
                        echo "✅ DEPLOYMENT FINISHED SUCCESSFULLY!"
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
