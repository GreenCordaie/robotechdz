import { NextResponse } from "next/server";
import { eventBus, SystemEvent } from "@/lib/events";
import { db } from "@/db";

export async function GET() {
    try {
        const lastOrder = await db.query.orders.findFirst({
            orderBy: (o, { desc }) => desc(o.id)
        });

        if (!lastOrder) {
            return NextResponse.json({ error: "No orders found" }, { status: 404 });
        }

        console.log(`>> [DebugAPI] Triggering test delivery for order: ${lastOrder.id}`);

        // Use the event bus directly to see if the worker picks it up
        eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId: lastOrder.id });

        return NextResponse.json({
            success: true,
            message: `Event ORDER_DELIVERED emitted for order ${lastOrder.id}`,
            checkLogs: "Check console for [Worker] Handling ORDER_DELIVERED"
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
