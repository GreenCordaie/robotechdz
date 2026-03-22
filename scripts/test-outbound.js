const http = require('http');

const payload = JSON.stringify({
    number: "33754027162@s.whatsapp.net",
    options: {
        delay: 0,
        presence: "composing",
        linkPreview: false
    },
    textMessage: {
        text: "Test de connexion IA - Réponse automatique (Direct API)"
    }
});

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/message/sendText/robotech',
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
