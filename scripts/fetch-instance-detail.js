const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/instance/fetchInstances',
    method: 'GET',
    headers: {
        'apikey': 'abc'
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        const instances = JSON.parse(data);
        console.log(JSON.stringify(instances, null, 2));
        process.exit(0);
    });
});

req.on('error', (e) => {
    console.error(`PROBLEM: ${e.message}`);
    process.exit(1);
});

req.end();
