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
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '213' + cleaned.substring(1);
    } else if (cleaned.length === 9) {
        cleaned = '213' + cleaned;
    }
    // If it already starts with 213, keep it as is (after cleanup)
    return `+${cleaned}`;
}
