const https = require('https');

function testDirect() {
    const data = JSON.stringify({
        eventName: "WHATSAPP_SUPPORT",
        config: {
            wa_key: "abc"
        },
        data: {
            message: "Direct diagnostic test via native https"
        }
    });

    const options = {
        hostname: 'n8n.robotech-dz.com',
        port: 443,
        path: '/webhook/flexbox',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    console.log('Testing n8n dispatcher directly at: https://n8n.robotech-dz.com/webhook/flexbox');

    const req = https.request(options, (res) => {
        console.log('Status:', res.statusCode);
        res.on('data', (d) => {
            process.stdout.write(d);
        });
    });

    req.on('error', (error) => {
        console.error('Error:', error.message);
    });

    req.write(data);
    req.end();
}

testDirect();
