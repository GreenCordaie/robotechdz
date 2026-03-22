const https = require('https');

function testDirect() {
    const data = JSON.stringify({
        eventName: "WHATSAPP_SUPPORT",
        config: {
            wa_key: "abc"
        },
        data: {
            message: "Direct diagnostic test via Cloudflare tunnel URL"
        }
    });

    const url = "https://proportion-input-fishing-facing.trycloudflare.com/webhook/flexbox";

    console.log('Testing n8n dispatcher directly at:', url);

    const options = {
        hostname: 'proportion-input-fishing-facing.trycloudflare.com',
        port: 443,
        path: '/webhook/flexbox',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

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
