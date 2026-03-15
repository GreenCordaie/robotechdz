const token = "8654979494:AAFkggRLkgWcNB3tcsXyzFsbPOXRPdlpm7Q";
const chatId = "-5101003568";

async function test() {
    console.log("Testing Telegram API with provided credentials...");
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: "🚀 *FLEXBOX DIRECT* : Test de diagnostic en cours...",
                parse_mode: "Markdown",
            }),
        });

        const data = await response.json();
        console.log("Response Status:", response.status);
        console.log("Response Data:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Fetch Error:", error);
    }
}

test();
