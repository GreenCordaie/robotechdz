const https = require('http');

console.log("Starting script...");

const options = {
    hostname: 'localhost',
    port: 5678,
    path: '/api/v1/workflows/2BjUu0xqxlfXjX4n',
    method: 'GET',
    headers: {
        'x-n8n-api-key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMjQ2MDFlNy00NDhhLTQxMWYtYWUwMC03MmJlNzE3ZWE5MjIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDZhNzRkOGQtMWI4ZS00ZGJlLTk3ZmYtNDU3MjYyYTUwZmMzIiwiaWF0IjoxNzc0MDAzMjQ4fQ.dCgyUm0ZRBQlgGQESrdfesdXUk2T6WHdXrVFJfPIRgQ'
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const workflow = JSON.parse(data);
            let modified = false;

            console.log("Keys in response:", Object.keys(workflow));

            let nodesTarget = workflow.nodes;
            if (!nodesTarget && workflow.data && workflow.data.nodes) {
                nodesTarget = workflow.data.nodes;
            }

            if (!nodesTarget) {
                console.log("No nodes found. Data snippet:", data.substring(0, 100));
                return;
            }

            nodesTarget.forEach(node => {
                if (node.type === 'n8n-nodes-base.switch' && node.name === 'EventTypeSwitch') {
                    if (node.parameters.rules && node.parameters.rules.values) {
                        node.parameters.rules.values.forEach((val, i) => {
                            if (val.conditions && val.conditions.conditions) {
                                val.conditions.conditions.forEach(cond => {
                                    if (cond.rightValue === 'CUSTOMER_DELIVERY' && cond.operator && cond.operator.operation === 'equals,type:string') {
                                        cond.operator = { operation: 'equals', type: 'string' };
                                        modified = true;
                                        console.log('Fixed operator for CUSTOMER_DELIVERY');
                                    }
                                });
                            }
                            if (val.conditions && val.conditions.options) {
                                if (val.conditions.options.caseSensitive !== undefined) {
                                    delete val.conditions.options.caseSensitive;
                                }
                                val.conditions.options.ignoreCase = false;
                                modified = true;
                                console.log(`Modified options for rule ${i}`);
                            }
                        });
                    }
                }
            });

            if (modified) {
                console.log("Modifications made, sending PUT request...");
                const putOptions = {
                    hostname: 'localhost',
                    port: 5678,
                    path: '/api/v1/workflows/2BjUu0xqxlfXjX4n',
                    method: 'PUT',
                    headers: {
                        'x-n8n-api-key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMjQ2MDFlNy00NDhhLTQxMWYtYWUwMC03MmJlNzE3ZWE5MjIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDZhNzRkOGQtMWI4ZS00ZGJlLTk3ZmYtNDU3MjYyYTUwZmMzIiwiaWF0IjoxNzc0MDAzMjQ4fQ.dCgyUm0ZRBQlgGQESrdfesdXUk2T6WHdXrVFJfPIRgQ',
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                };

                const putPayload = {
                    nodes: workflow.nodes,
                    connections: workflow.connections
                };
                if (workflow.name !== undefined) putPayload.name = workflow.name;

                const putData = JSON.stringify(putPayload);

                const putReq = https.request(putOptions, (putRes) => {
                    let out = '';
                    putRes.on('data', (c) => out += c);
                    putRes.on('end', () => console.log('Update result:', putRes.statusCode, out));
                });

                putReq.on('error', err => console.error("PUT Error:", err));
                putReq.write(putData);
                putReq.end();
            } else {
                console.log('No modifications needed.');
            }
        } catch (e) {
            console.error("Error parsing or processing:", e);
        }
    });
});

req.on('error', err => console.error("GET Error:", err));
req.end();
