/**
 * Centralized utility for currency formatting.
 * USD: $150.00
 * DZD: 15 000 DZD
 */
export function formatCurrency(amount: number | string, currency: 'DZD' | 'USD' = 'DZD') {
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(numericAmount)) return "0";

    if (currency === 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numericAmount);
    }

    // DZD Format: 15 000 DZD
    const formatted = new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(numericAmount);

    return `${formatted} DZD`;
}

export function formatDate(date: Date | string) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(d);
}

export function formatWhatsApp(phone: string | null) {
    if (!phone) return "";

    // If it's a known LID or contains @lid, we treat it as an ID
    if (phone.includes('@lid')) {
        return `ID: ${phone.split('@')[0]}`;
    }

    // Clean: remove everything that's not a digit
    let cleaned = phone.replace(/\D/g, '');

    // LID-stripped numeric strings are usually very long (14-16 digits)
    // Real phone numbers with 213 prefix are 12 digits.
    if (cleaned.length > 13) {
        return `ID: ${cleaned}`;
    }

    // If it starts with 0 (local Algerian format), replace with 213
    if (cleaned.startsWith('0')) {
        cleaned = '213' + cleaned.substring(1);
    }
    // If it's 9 digits, it's missing the prefix
    else if (cleaned.length === 9) {
        cleaned = '213' + cleaned;
    }

    return `+${cleaned}`;
}

/**
 * Converts a WhatsApp number (213...) back to local natural format (0...) 
 * if it matches the Algerian pattern.
 */
export function formatPhoneNatural(phone: string | null) {
    if (!phone) return "";
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('213') && cleaned.length === 12) {
        return '0' + cleaned.substring(3);
    }
    if (cleaned.length === 9) {
        return '0' + cleaned;
    }
    return phone;
}
