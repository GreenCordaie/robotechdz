
const http = require('http');

const data = JSON.stringify({
    instanceName: "FLEXBOX_APP",
    token: "abc",
    qrcode: true
});

const options = {
    hostname: '127.0.0.1',
    port: 3001,
    path: '/instance/create',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'apikey': 'abc'
    }
};

console.log('Sending creation request for FLEXBOX_APP...');

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('BODY:', body);
    });
});

req.on('error', (e) => {
    console.error(`PROBLEM WITH REQUEST: ${e.message}`);
});

req.write(data);
req.end();
