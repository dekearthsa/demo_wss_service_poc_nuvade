import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import axios from 'axios';

const fastify = Fastify({ logger: true });

const VERIFY_TOKEN = ''
const PAGE_ACCESS_TOKEN = ''

fastify.register(fastifyWebsocket);
const clients = new Map();

fastify.get('/ws', { websocket: true }, (connection, req) => {
    const id = req.headers['sec-websocket-key'];
    clients.set(id, connection);
    fastify.log.info(`WS client connected: ${id}`);

    connection.socket.on('message', async (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'send' && data.recipientId && data.text) {
                await sendToFacebook(data.recipientId, data.text);
            }
        } catch (err) {
            fastify.log.error('Invalid WS message', err);
        }
    });

    connection.socket.on('close', () => {
        clients.delete(id);
        fastify.log.info(`WS client disconnected: ${id}`);
    });
});

fastify.get('/debug', async (request, reply) => {
    reply.code(200).send("ok");
})

fastify.get('/webhook', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        reply.code(200).send(challenge);
    } else {
        reply.code(403).send('Forbidden');
    }
});

fastify.post('/webhook', async (request, reply) => {
    reply.code(200).send('EVENT_RECEIVED');

    const body = request.body;
    if (body.object !== 'page' || !Array.isArray(body.entry)) return;

    for (const entry of body.entry) {
        const event = entry.messaging && entry.messaging[0];
        if (!event) continue;
        const senderId = event.sender && event.sender.id;
        broadcast({ type: 'message', senderId, event });
    }
});

function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const [, conn] of clients) {
        conn.socket.send(data);
    }
}

async function sendToFacebook(recipientId, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                recipient: { id: recipientId },
                message: { text },
            }
        );
        fastify.log.info(`Sent message to ${recipientId}`);
    } catch (err) {
        fastify.log.error('Error sending to FB', err?.response?.data || err);
    }
}

fastify.listen({ port: 3111, host: '0.0.0.0' }, (err, address) => {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
    fastify.log.info(`Server running at ${address}`);
});
