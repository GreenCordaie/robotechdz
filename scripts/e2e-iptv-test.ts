// Patch server-only before any import
import { createRequire } from "module";
const require = createRequire(import.meta.url);
try {
  const mod = require.resolve("server-only");
  require.cache[mod] = { id: mod, filename: mod, loaded: true, exports: {} } as any;
} catch {}

// Patch react.cache
import * as React from "react";
if (!(React as any).cache) (React as any).cache = (fn: any) => fn;

import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { OrderService } from "@/services/order.service";

const orderIds = [582, 583, 584];
const names = ["King365", "Iron Max", "Atlas Pro"];

async function main() {
  for (let i = 0; i < orderIds.length; i++) {
    console.log(`\n=== [${i + 1}/3] Paying ${names[i]} order #${orderIds[i]} ===`);
    try {
      const result = await OrderService.payOrder(orderIds[i], 1, { montantPaye: "0" });
      console.log(`✅ ${names[i]} — status: ${(result as any).status}`);
    } catch (err: any) {
      console.error(`❌ ${names[i]} failed:`, err.message);
    }
    if (i < orderIds.length - 1) {
      console.log("⏳ Waiting 8s (Chrome cooldown)...");
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
  console.log("\n=== Done — check WhatsApp +213779294045 ===");
  process.exit(0);
}

main();
