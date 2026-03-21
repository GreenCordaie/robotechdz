async function sendTest() {
    try {
        const response = await fetch('http://localhost:3001/message/sendText/robotech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': 'abc'
            },
            body: JSON.stringify({
                number: '213781480740',
                textMessage: {
                    text: '*TEST FLEXBOX DIRECT*\n\nVoici ton code : *CODE-TEST-1234*\n\nCette commande valide le bon fonctionnement de l\'automate de livraison WhatsApp ! 🚀',
                },
                options: {
                    delay: 1200,
                    presence: 'composing'
                }
            })
        });
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(err);
    }
}

sendTest();
