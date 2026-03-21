const fs = require('fs');
const path = 'C:/Users/PC/Desktop/100-pc-IA/fixed_n8n_workflow.json';
let content = fs.readFileSync(path, 'utf8');

// Replace tg_traiteur with tg_caisse in the specific node
content = content.replace(
    /\"chat_id\": \"\{\{ \$json\.body\.config\.tg_traiteur \}\}\"/g,
    '\"chat_id\": \"{{ $json.body.config.tg_caisse }}\"'
);

fs.writeFileSync(path, content);
console.log('Workflow redirected successfully.');
