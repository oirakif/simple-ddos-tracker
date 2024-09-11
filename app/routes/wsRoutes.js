const controller = require('../controllers/attacksController')

module.exports = (wss, openState) => {
    // Set up WebSocket connection
    wss.on('connection', (ws) => {
        // Fetch data immediately upon connection
        controller.callmeWebSocket(ws)
    });

    setInterval(async () => {
        const data = await controller.fetchAttackData();
        if (data) {
            wss.clients.forEach(client => {
                if (client.readyState === openState) {
                    client.send(JSON.stringify(data));
                }
            });
        }
    }, 180000);
};