const fs = require('fs');

const inputPath = 'C:\\Users\\PC\\.gemini\\antigravity\\brain\\e099ed6f-2063-44b9-8ab0-36e88d728d3e\\.system_generated\\steps\\8645\\output.txt';
const outputPath = 'C:\\Users\\PC\\Desktop\\100-pc-IA\\n8n_update_payload_final.json';

try {
    const raw = fs.readFileSync(inputPath, 'utf8');
    const fullResponse = JSON.parse(raw);
    const workflow = fullResponse.data;

    // Fix ExecuteWorkflowTrigger version and parameters
    const trigger = workflow.nodes.find(n => n.type === 'n8n-nodes-base.executeWorkflowTrigger');
    if (trigger) {
        trigger.typeVersion = 1.1;
        trigger.parameters = trigger.parameters || {};
        trigger.parameters.inputSource = 'passthrough';
    }

    // Fix EventTypeSwitch options
    const switchNode = workflow.nodes.find(n => n.name === 'EventTypeSwitch');
    if (switchNode && switchNode.parameters && switchNode.parameters.rules && switchNode.parameters.rules.values) {
        switchNode.parameters.rules.values.forEach(rule => {
            if (rule.conditions) {
                rule.conditions.options = {
                    "ignoreCase": false,
                    "typeValidation": "strict"
                };
            }
        });
    }

    // Patch WA_Customer_Delivery (again, to be sure)
    const waNode = workflow.nodes.find(n => n.name === 'WA_Customer_Delivery_1' || n.name === 'WA_Customer_Delivery');
    if (waNode && waNode.parameters) {
        waNode.parameters.jsonBody = "={\n  \"number\": \"213{{ $json.body.data.customerPhone.replace(/^0/, '') }}\",\n  \"text\": \"✅ Votre commande #{{ $json.body.data.orderNumber }} est prête !\\n\\nVoici vos accès :\\n{{ $json.body.data.formattedItemsText }}\\n\\nMerci pour votre achat. Vous pouvez suivre votre commande sur {{ $json.body.data.appUrl }}/suivi/{{ $json.body.data.orderNumber }}\"\n}";
    }

    const updateData = {
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings
    };

    fs.writeFileSync(outputPath, JSON.stringify(updateData, null, 2));
    console.log("Success: Prepared final update payload.");
} catch (e) {
    console.error(e);
}
