import json
import urllib.request
import urllib.error

url = 'http://localhost:5678/api/v1/workflows/2BjUu0xqxlfXjX4n'
api_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMjQ2MDFlNy00NDhhLTQxMWYtYWUwMC03MmJlNzE3ZWE5MjIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDZhNzRkOGQtMWI4ZS00ZGJlLTk3ZmYtNDU3MjYyYTUwZmMzIiwiaWF0IjoxNzc0MDAzMjQ4fQ.dCgyUm0ZRBQlgGQESrdfesdXUk2T6WHdXrVFJfPIRgQ'

# Fetch workflow
req = urllib.request.Request(url, headers={'x-n8n-api-key': api_key})
with urllib.request.urlopen(req) as resp:
    wf = json.loads(resp.read().decode())

# Modify WA_Customer_Delivery node
for node in wf['nodes']:
    if node['name'] == 'WA_Customer_Delivery':
        # Current body:
        # {
        #   "number": "213{{ $json.body.data.customerPhone.replace(/^0/, '') }}",
        #   "text": "..."
        # }
        # New body logic:
        new_json_body = '={\n  "number": "{{ $json.body.data.customerPhone.startsWith(\'213\') ? $json.body.data.customerPhone : \'213\' + $json.body.data.customerPhone.replace(/^0/, \'\') }}",\n  "textMessage": {\n    "text": "✅ Votre commande #{{ $json.body.data.orderNumber }} est prête !\\n\\nVoici vos accès :\\n{{ $json.body.data.formattedItemsText }}\\n\\nMerci pour votre achat. Vous pouvez suivre votre commande sur {{ $json.body.data.appUrl }}/suivi/{{ $json.body.data.orderNumber }}"\n  }\n}'
        node['parameters']['jsonBody'] = new_json_body

# Remove connection from WA_Customer_Delivery to failing node
if 'WA_Customer_Delivery' in wf['connections']:
    del wf['connections']['WA_Customer_Delivery']

# Filter settings to avoid "additional properties" error
wf_settings = wf.get('settings', {})
allowed_settings = ['saveDataErrorExecution', 'saveDataSuccessExecution', 'saveManualExecutions', 'saveExecutionProgress', 'executionOrder', 'errorWorkflow', 'timezone']
safe_settings = {k: v for k, v in wf_settings.items() if k in allowed_settings}

payload = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': safe_settings
}

# Update workflow
req_put = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'x-n8n-api-key': api_key, 'Content-Type': 'application/json'}, method='PUT')
try:
    with urllib.request.urlopen(req_put) as put_resp:
        print('Updated successfully! Status:', put_resp.status)
except urllib.error.HTTPError as e:
    print('Error:', e.code, e.read().decode())
