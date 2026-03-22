const http = require('http');

const payload = JSON.stringify({
    url: "http://192.168.65.254:1556/api/webhooks/whatsapp",
    webhookByEvents: false,
    webhookBase64: false,
    events: [
        "messages.upsert",
        "messages.update",
        "messages.delete",
        "send.message",
        "connection.update",
        "call"
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
        process.exit(0);
    });
});

req.on('error', (e) => {
    console.error(`PROBLEM: ${e.message}`);
    process.exit(1);
});

req.write(payload);
req.end();
