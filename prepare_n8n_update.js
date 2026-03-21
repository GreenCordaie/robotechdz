const fs = require('fs');

const inputPath = 'C:\\Users\\PC\\.gemini\\antigravity\\brain\\e099ed6f-2063-44b9-8ab0-36e88d728d3e\\.system_generated\\steps\\8645\\output.txt';
const outputPath = 'C:\\Users\\PC\\Desktop\\100-pc-IA\\n8n_update_payload.json';

try {
    const raw = fs.readFileSync(inputPath, 'utf8');
    const fullResponse = JSON.parse(raw);
    const workflow = fullResponse.data;

    // We only need nodes and connections for the update
    const updateData = {
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings
    };

    // Find and patch WA_Customer_Delivery
    const waNode = updateData.nodes.find(n => n.name === 'WA_Customer_Delivery_1' || n.name === 'WA_Customer_Delivery');
    if (waNode && waNode.parameters) {
        waNode.parameters.jsonBody = "={\n  \"number\": \"213{{ $json.body.data.customerPhone.replace(/^0/, '') }}\",\n  \"text\": \"✅ Votre commande #{{ $json.body.data.orderNumber }} est prête !\\n\\nVoici vos accès :\\n{{ $json.body.data.formattedItemsText }}\\n\\nMerci pour votre achat. Vous pouvez suivre votre commande sur {{ $json.body.data.appUrl }}/suivi/{{ $json.body.data.orderNumber }}\"\n}";
        console.log("Patched node WA_Customer_Delivery");
    }

    fs.writeFileSync(outputPath, JSON.stringify(updateData, null, 2));
    console.log("Update payload prepared at " + outputPath);
} catch (e) {
    console.error(e);
}
