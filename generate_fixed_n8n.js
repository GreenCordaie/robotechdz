const fs = require('fs');

async function fixWorkflow() {
    const filePath = 'C:/Users/PC/.gemini/antigravity/brain/e099ed6f-2063-44b9-8ab0-36e88d728d3e/.system_generated/steps/7492/output.txt';

    try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(rawData);

        const workflow = parsed.data;

        // Find the node
        const tgNodeIndex = workflow.nodes.findIndex(n => n.name === 'TG_Traiteur_NewOrder');
        if (tgNodeIndex !== -1) {
            // Create new jsonBody string
            const newJsonBody = `={
  "chat_id": "{{ $json.body.config.tg_traiteur }}",
  "text": "📋 *Commande à traiter #{{ $json.body.data.orderNumber }}*\\n\\n📱 Client: {{ $json.body.data.customerPhone }}\\n💰 Total: {{ $json.body.data.totalAmount }} DZD",
  "parse_mode": "Markdown",
  "reply_markup": {
    "inline_keyboard": [
      [
        { "text": "✅ Valider & Livrer", "callback_data": "VALIDATE_{{ $json.body.data.orderId }}" },
        { "text": "❌ Annuler", "callback_data": "CANCEL_{{ $json.body.data.orderId }}" }
      ]
    ]
  }
}`;

            workflow.nodes[tgNodeIndex].parameters.jsonBody = newJsonBody;

            // Save the fixed workflow
            fs.writeFileSync('C:/Users/PC/Desktop/100-pc-IA/fixed_n8n_workflow.json', JSON.stringify(workflow, null, 2));
            console.log('Fixed workflow saved to C:/Users/PC/Desktop/100-pc-IA/fixed_n8n_workflow.json');
        } else {
            console.log('Node TG_Traiteur_NewOrder not found!');
        }
    } catch (err) {
        console.error('Error generating fixed workflow:', err);
    }
}

fixWorkflow();
