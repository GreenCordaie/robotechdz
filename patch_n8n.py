import json
import urllib.request
import certifi

url = "http://localhost:5678/api/v1/workflows/2BjUu0xqxlfXjX4n"
api_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMjQ2MDFlNy00NDhhLTQxMWYtYWUwMC03MmJlNzE3ZWE5MjIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDZhNzRkOGQtMWI4ZS00ZGJlLTk3ZmYtNDU3MjYyYTUwZmMzIiwiaWF0IjoxNzc0MDAzMjQ4fQ.dCgyUm0ZRBQlgGQESrdfesdXUk2T6WHdXrVFJfPIRgQ"

req = urllib.request.Request(url, headers={'x-n8n-api-key': api_key})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        
        nodes = data.get('nodes', [])
        for node in nodes:
            if node['name'] == 'EventTypeSwitch':
                for val in node['parameters']['rules']['values']:
                    if 'ignoreCase' in val['conditions']['options']:
                        del val['conditions']['options']['ignoreCase']
                    val['conditions']['options']['caseSensitive'] = True
                    # Also fix operator string issue
                    for cond in val['conditions']['conditions']:
                        if isinstance(cond['operator'], dict) and cond['operator'].get('operation') == 'equals,type:string':
                            cond['operator'] = {'operation': 'equals', 'type': 'string'}

        payload = {
            'name': data['name'],
            'nodes': nodes,
            'connections': data['connections'],
            'settings': {}
        }
        
        req_put = urllib.request.Request(
            url, 
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'x-n8n-api-key': api_key, 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            method='PUT'
        )
        
        with urllib.request.urlopen(req_put) as put_resp:
            print("Successfully updated! Status:", put_resp.status)
            print(put_resp.read().decode())

except Exception as e:
    print("Error:", e)
    if hasattr(e, 'read'):
        print(e.read().decode())
