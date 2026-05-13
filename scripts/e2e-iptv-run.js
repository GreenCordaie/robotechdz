// This will be loaded after patches
async function main() {
  const { db } = require('./src/db/index');
  const { OrderService } = require('./src/services/order.service');

  const orderIds = [582, 583, 584];
  const names = ['King365', 'Iron Max', 'Atlas Pro'];

  for (let i = 0; i < orderIds.length; i++) {
    console.log(`\n=== [${i+1}/3] Paying ${names[i]} order #${orderIds[i]} ===`);
    try {
      const result = await OrderService.payOrder(orderIds[i], 1, { montantPaye: "0" });
      console.log(`✅ ${names[i]} — status: ${result.status}`);
    } catch(err) {
      console.error(`❌ ${names[i]} failed:`, err.message);
    }
    if (i < orderIds.length - 1) {
      console.log('⏳ Waiting 8s (Chrome cooldown)...');
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  console.log('\n=== Done — check WhatsApp +213779294045 ===');
  process.exit(0);
}
main();
