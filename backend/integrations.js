// backend/integrations.js

export async function sendToSlack(agentName, content) {
    console.log(`\n🔔 [SLACK INCOMING MESSAGE] from integration: ${agentName}`);
    console.log(`=======================================================`);
    console.log(content);
    console.log(`=======================================================\n`);

    return { success: true, deliveredAt: new Date().toISOString() };
}