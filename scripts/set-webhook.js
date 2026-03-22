const http = require('http');

const payload = JSON.stringify({
    url: "http://host.docker.internal:1556/api/webhooks/whatsapp",
    webhookByEvents: false,
    webhookBase64: false,
    events: [
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "MESSAGES_DELETE",
        "SEND_MESSAGE",
        "CONNECTION_UPDATE",
        "CALL"
    ]
});

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/webhook/set/robotech',
    method: 'POST',
    headers: {
        'apikey': 'abc',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`RESPONSE: ${data}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    console.error(`PROBLEM: ${e.message}`);
    process.exit(1);
});

req.write(payload);
req.end();
