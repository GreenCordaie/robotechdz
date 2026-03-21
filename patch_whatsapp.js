const fs = require('fs');

const workflowPath = 'C:\\Users\\PC\\Desktop\\100-pc-IA\\manual_delivery_workflow.json';

try {
    let rawdata = fs.readFileSync(workflowPath);
    let workflow = JSON.parse(rawdata);

    // Find the WA_Customer_Delivery node
    let waNode = workflow.nodes.find(n => n.name === 'WA_Customer_Delivery_1' || n.name === 'WA_Customer_Delivery');

    if (waNode && waNode.parameters && waNode.parameters.jsonBody) {
        const newText = "✅ Votre commande #{{ $json.body.data.orderNumber }} est prête !\\n\\nVoici vos accès :\\n{{ $json.body.data.formattedItemsText }}\\n\\nMerci pour votre achat. Vous pouvez suivre votre commande sur {{ $json.appUrl }}/suivi/{{ $json.body.data.orderNumber }}";

        // Update the jsonBody
        waNode.parameters.jsonBody = "={\n  \"number\": \"213{{ $json.body.data.customerPhone.replace(/^0/, '') }}\",\n  \"text\": \"" + newText + "\"\n}";

        console.log("Updated WhatsApp delivery node successfully.");
    } else {
        console.error("Could not find WhatsApp node or its jsonBody.");
    }

    fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
    console.log("Workflow patched successfully.");
} catch (e) {
    console.error(e);
}
