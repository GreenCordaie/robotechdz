/**
 * ESC/POS Binary Render Engine for 80mm Thermal Printers
 * Specialized for FLEXBOX II Direct WebUSB Printing
 */

const ESC = 0x1B;
const GS = 0x1D;

export const COMMANDS = {
    INITIALIZE: new Uint8Array([ESC, 0x40]),
    ALIGN_LEFT: new Uint8Array([ESC, 0x61, 0x00]),
    ALIGN_CENTER: new Uint8Array([ESC, 0x61, 0x01]),
    ALIGN_RIGHT: new Uint8Array([ESC, 0x61, 0x02]),
    BOLD_ON: new Uint8Array([ESC, 0x45, 0x01]),
    BOLD_OFF: new Uint8Array([ESC, 0x45, 0x00]),
    DOUBLE_STRIKE_ON: new Uint8Array([ESC, 0x47, 0x01]),
    DOUBLE_STRIKE_OFF: new Uint8Array([ESC, 0x47, 0x00]),
    CONDENSED_ON: new Uint8Array([ESC, 0x21, 0x01]),
    CONDENSED_OFF: new Uint8Array([ESC, 0x21, 0x00]),
    DOUBLE_SIZE: new Uint8Array([GS, 0x21, 0x11]),
    NORMAL_SIZE: new Uint8Array([GS, 0x21, 0x00]),
    CUT: new Uint8Array([GS, 0x56, 66, 0x00]), // Complete cut [1D 56 42 00]
    LINE_FEED: new Uint8Array([0x0A]),
};

export class EscPosEncoder {
    private buffer: number[] = [];
    private lineLength = 48; // Xprinter 80C Optimized

    constructor() {
        this.add(COMMANDS.INITIALIZE);
    }

    public add(data: Uint8Array | number[]) {
        this.buffer.push(...Array.from(data));
    }

    text(content: string) {
        const encoder = new TextEncoder();
        this.add(encoder.encode(content));
        return this;
    }

    line(content: string = "") {
        this.text(content);
        this.add(COMMANDS.LINE_FEED);
        return this;
    }

    bold(content: string) {
        this.add(COMMANDS.BOLD_ON);
        this.text(content);
        this.add(COMMANDS.BOLD_OFF);
        return this;
    }

    center(content: string, doubleSize: boolean = false) {
        this.add(COMMANDS.ALIGN_CENTER);
        if (doubleSize) this.add(COMMANDS.DOUBLE_SIZE);
        this.line(content);
        if (doubleSize) this.add(COMMANDS.NORMAL_SIZE);
        this.add(COMMANDS.ALIGN_LEFT);
        return this;
    }

    doubleStrike(content: string) {
        this.add(COMMANDS.DOUBLE_STRIKE_ON);
        this.text(content);
        this.add(COMMANDS.DOUBLE_STRIKE_OFF);
        return this;
    }

    condensed(content: string) {
        this.add(COMMANDS.CONDENSED_ON);
        this.text(content);
        this.add(COMMANDS.CONDENSED_OFF);
        return this;
    }

    /**
     * Carrefour/Lidl Style: Name on left, Price on right
     */
    row(name: string, price: string) {
        const padding = this.lineLength - name.length - price.length;
        if (padding > 0) {
            this.line(name + " ".repeat(padding) + price);
        } else {
            // Handle long names: truncate or wrap name, then right-align price
            const truncatedName = name.substring(0, this.lineLength - price.length - 1);
            this.line(truncatedName + " " + price);
        }
        return this;
    }

    /**
     * Manual Line Wrap for long codes
     */
    wrappedText(content: string, indent: string = "  ") {
        const maxContentLength = this.lineLength - indent.length;
        let remaining = content;
        while (remaining.length > 0) {
            this.line(indent + remaining.substring(0, maxContentLength));
            remaining = remaining.substring(maxContentLength);
        }
        return this;
    }

    separator() {
        this.line("-".repeat(this.lineLength));
        return this;
    }

    barcode(data: string) {
        this.add(COMMANDS.ALIGN_CENTER);
        // GS k 73 (Code 128) [n] [data]
        // We use system B (73) which handles ASCII
        const header = new Uint8Array([GS, 0x6B, 73, data.length]);
        this.add(header);
        this.text(data);
        this.add(COMMANDS.LINE_FEED);
        this.add(COMMANDS.ALIGN_LEFT);
        return this;
    }

    cut() {
        this.add(COMMANDS.CUT);
        return this;
    }

    encode(): Uint8Array {
        return new Uint8Array(this.buffer);
    }
}

export function generateOrderEscPos(orderData: any, shopSettings: any) {
    const encoder = new EscPosEncoder();

    // Reset Header
    encoder.add(COMMANDS.INITIALIZE);

    // Header - Double Strike for Deep Black Branding
    encoder.add(COMMANDS.ALIGN_CENTER);
    encoder.doubleStrike(shopSettings.shopName.toUpperCase());
    encoder.add(COMMANDS.LINE_FEED);

    if (shopSettings.shopAddress) encoder.line(shopSettings.shopAddress);
    if (shopSettings.shopTel) encoder.line("Tel: " + shopSettings.shopTel);
    encoder.separator();
    encoder.add(COMMANDS.ALIGN_LEFT);

    // Order Info
    encoder.bold(`COMMANDE: ${orderData.orderNumber}`);
    encoder.line(`Date: ${new Date(orderData.date).toLocaleString('fr-FR')}`);
    if (shopSettings.showCashier && orderData.cashier) {
        encoder.line(`Caissier: ${orderData.cashier}`);
    }
    encoder.separator();

    // Items
    orderData.items.forEach((item: any) => {
        encoder.row(`${item.quantity}x ${item.name}`, `${item.price} DZD`);

        // Credentials / Codes in Condensed mode for readability
        if (item.playerNickname) {
            encoder.text("  PSEUDO: ");
            encoder.condensed(item.playerNickname);
            encoder.add(COMMANDS.LINE_FEED);
        }

        if (item.customData) {
            encoder.text("  ID/LIEN: ");
            encoder.condensed(item.customData);
            encoder.add(COMMANDS.LINE_FEED);
        }

        if (item.codes && item.codes.length > 0) {
            item.codes.forEach((code: string) => {
                // Ultra-Compact display for shared accounts
                if (code.includes('|')) {
                    const parts = code.split('|').map(p => p.trim());
                    // Format: Email | Pass | Profil X | PIN: XXXX
                    let accountLine = `${parts[0]} | ${parts[1]} | ${parts[2]}`;
                    if (parts[3]) accountLine += ` | PIN:${parts[3]}`;

                    encoder.text("  ");
                    encoder.condensed(accountLine);
                    encoder.add(COMMANDS.LINE_FEED);
                } else {
                    encoder.text("  CODE: ");
                    encoder.condensed(code);
                    encoder.add(COMMANDS.LINE_FEED);
                }
            });
        }
        encoder.line(); // Spacer
    });

    encoder.separator();

    // Total
    encoder.add(COMMANDS.ALIGN_RIGHT);
    encoder.bold(`TOTAL: ${orderData.totalAmount} DZD`);
    encoder.add(COMMANDS.LINE_FEED);
    encoder.line(`PAIEMENT: ${orderData.paymentMethod.toUpperCase()}`);

    if (orderData.totalClientDebt > 0) {
        encoder.line(`RESTE À PAYER (CLIENT): ${orderData.totalClientDebt} DZD`);
    }

    encoder.add(COMMANDS.ALIGN_LEFT);

    // Footer
    encoder.separator();
    encoder.center(shopSettings.footerMessage.toUpperCase());
    encoder.line();

    // Barcode for easy tracking
    const barcodeData = orderData.orderNumber.replace('#', '');
    encoder.barcode(barcodeData);

    encoder.line();
    encoder.line();

    // Complete cutter sequence for Xprinter 80C
    encoder.cut();

    return encoder.encode();
}
