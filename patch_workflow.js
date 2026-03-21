const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('fixed_n8n_workflow.json', 'utf8'));
const secret = "8654979494:AAFkggRLkgWcNB3tcsXyzFsbPOXRPdlpm7Q"; // Confirmed token

// 1. Update Notification Text in tg_caisse_NewOrder
const notifyNode = workflow.nodes.find(n => n.name === 'tg_caisse_NewOrder' || n.name === 'TG_Caisse_NewOrder');
if (notifyNode) {
    notifyNode.parameters.jsonBody = '={\n' +
        '  "chat_id": "{{ $json.body.config.tg_caisse }}",\n' +
        '  "text": "📋 *Commande à traiter #{{ $json.body.data.orderNumber }}*\\n\\n👤 Client: {{ $json.body.data.customerPhone }}\\n💰 Total: {{ $json.body.data.totalAmount || $json.body.data.total }} DZD\\n\\n📦 *Articles à livrer :*\\n{{ $json.body.data.itemsCount || $json.body.data.items?.length }} article(s)\\n\\n---------------------------\\n👉 *Répondez à ce message* avec les codes l\'un après l\'autre (un code par ligne).\\n---------------------------\\nREF: {{ $json.body.data.orderId }}\\nURL: {{ $json.body.data.appUrl }}",\n' +
        '  "parse_mode": "Markdown"\n' +
        '}';
    // Remove inline keyboard (buttons)
    delete notifyNode.parameters.reply_markup;
}

// 2. Add Telegram Webhook Node if it doesn't exist
if (!workflow.nodes.find(n => n.name === 'Telegram_Reply_Trigger')) {
    const tgTriggerNode = {
        "id": "TG_Reply_Trigger",
        "name": "Telegram_Reply_Trigger",
        "parameters": {
            "httpMethod": "POST",
            "options": {},
            "path": "telegram-reply-webhook",
            "responseMode": "lastNode"
        },
        "position": [
            112,
            800
        ],
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2.1,
        "webhookId": "tg-reply-webhook-flexbox"
    };
    workflow.nodes.push(tgTriggerNode);
}

// 3. Add Parse Reply Node if it doesn't exist
if (!workflow.nodes.find(n => n.name === 'Parse_Telegram_Reply')) {
    const parseReplyNode = {
        "id": "Parse_Telegram_Reply",
        "name": "Parse_Telegram_Reply",
        "parameters": {
            "jsCode": "const message = items[0].json.body?.message || items[0].json.message;\nif (!message || !message.reply_to_message || !message.reply_to_message.text) return [];\n\nconst replyText = message.reply_to_message.text;\nconst orderIdMatch = replyText.match(/REF:\\s*(\\d+)/);\nconst appUrlMatch = replyText.match(/URL:\\s*(https?:\\/\\/[^\\s\\n]+)/);\n\nif (!orderIdMatch) return [];\n\nconst orderId = parseInt(orderIdMatch[1]);\n// Extracting appUrl if present, otherwise using a placeholder\nlet appUrl = 'http://localhost:3000';\nif (appUrlMatch && appUrlMatch[1]) {\n    appUrl = appUrlMatch[1];\n} else if (message.text.includes('trycloudflare.com')) {\n    const urlMatch = message.text.match(/(https?:\\/\\/[^\\s\\n]+)/);\n    if (urlMatch) appUrl = urlMatch[1];\n}\n\nconst codes = message.text.split(/\\r?\\n/).map(s => s.trim()).filter(s => s !== \"\");\n\nreturn [{\n    json: {\n        event: \"ATTRIBUER_SLOT\",\n        orderId: orderId,\n        appUrl: appUrl,\n        data: { codes: codes }\n    }\n}];"
        },
        "position": [
            352,
            800
        ],
        "type": "n8n-nodes-base.code",
        "typeVersion": 2
    };
    workflow.nodes.push(parseReplyNode);
}

// 4. Update App_Callback call to be dynamic and secure
const callbackNode = workflow.nodes.find(n => n.name === 'App_Callback');
if (callbackNode) {
    callbackNode.parameters.url = "={{ $json.appUrl }}/api/admin/n8n/callback";
    callbackNode.parameters.sendBody = true;
    callbackNode.parameters.specifyBody = "json";
    callbackNode.parameters.jsonBody = "={\n  \"event\": \"{{ $json.event }}\",\n  \"orderId\": {{ $json.orderId }},\n  \"data\": {{ JSON.stringify($json.data) }},\n  \"secret\": \"" + secret + "\"\n}";
}

// 5. Update tg_caisse_ConfirmAttrib to send confirmation to the correct user
const confirmNode = workflow.nodes.find(n => n.name === 'tg_caisse_ConfirmAttrib');
if (confirmNode) {
    confirmNode.parameters.url = "https://api.telegram.org/bot" + secret + "/sendMessage";
    confirmNode.parameters.sendBody = true;
    confirmNode.parameters.specifyBody = "json";
    confirmNode.parameters.jsonBody = "={\n  \"chat_id\": \"{{ $('Telegram_Reply_Trigger').first().json.body.message.chat.id }}\",\n  \"text\": \"✅ *Réponse reçue de l'app* : {{ $json.message }}\",\n  \"parse_mode\": \"Markdown\"\n}";
}

// 6. Connect Trigger to Parser
if (!workflow.connections) workflow.connections = {};
if (!workflow.connections["Telegram_Reply_Trigger"]) {
    workflow.connections["Telegram_Reply_Trigger"] = {
        "main": [
            [
                {
                    "node": "Parse_Telegram_Reply",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };
}

// 6. Connect Parser to Callback
if (!workflow.connections["Parse_Telegram_Reply"]) {
    workflow.connections["Parse_Telegram_Reply"] = {
        "main": [
            [
                {
                    "node": "App_Callback",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };
}

// Connections from Callback node for completion feedback if needed
if (!workflow.connections["App_Callback"]) {
    workflow.connections["App_Callback"] = {
        "main": [[]]
    };
}

fs.writeFileSync('manual_delivery_workflow.json', JSON.stringify(workflow, null, 2));
console.log('Workflow patched successfully into manual_delivery_workflow.json');
