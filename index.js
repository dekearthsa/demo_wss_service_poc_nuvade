import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { MongoClient } from 'mongodb';
import cors from '@fastify/cors'
import sendToFacebook from './controller/sendToMeta.js';
import crudFunc from './controller/crudFunc.js';

const fastify = Fastify({ logger: true });
fastify.register(cors,{origin: "*"});

const VERIFY_TOKEN = ''
const DEMO_PAGEID = ''
const PAGE_ACCESS_TOKEN = ''
const DB = '';
const COLLECTION = '';
const MONGO_URI = '';
const mongoClient = new MongoClient(MONGO_URI, {
    tls: false,
    serverSelectionTimeoutMS: 5000
});

await mongoClient.connect();
fastify.log.info('MongoDB connected');

fastify.register(fastifyWebsocket, {
  options: { perMessageDeflate: false }
});

const clients = new Set()


fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket, req ) => {
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    fastify.log.info(`[WS] New client connected from ${clientIP}`);
    
    // เก็บ client socket ไว้ใน set
    clients.add(socket);

    // ส่งข้อความต้อนรับ
    socket.send(JSON.stringify({
      type: 'system',
      message: 'Connected to WebSocket server!',
      timestamp: new Date().toISOString()
    }));

    socket.on('message', (msg) => {
      fastify.log.info(`[WS] Message received: ${msg}`);

      socket.send(JSON.stringify({
        type: 'echo',
        received: msg.toString(),
        timestamp: new Date().toISOString()
      }));
    });

    socket.on('close', () => {
      fastify.log.info('[WS] Client disconnected');
      clients.delete(socket);
    });

    socket.on('error', (err) => {
      fastify.log.error('[WS] Error:', err);
      clients.delete(socket);
    });
  });

  fastify.decorate('broadcast', (data) => {
    const msg = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(msg);
      }
    }
  });
});
 

fastify.get('/debug', async (request, reply) => {
    return reply.code(200).send("ok");
})

fastify.get('/webhook', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];
    console.log(mode, token, challenge)
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return  reply.code(200).send(challenge);
    } else {    
        return reply.code(403).send('Forbidden');
    }
});

fastify.post('/webhook', async (request, reply) => {
    reply.code(200).send('EVENT_RECEIVED');

    const body = request.body;
    //  console.log(`body.entry.messaging[0] => `,  body.entry)
    if (body.object !== 'page' || !Array.isArray(body.entry)) return;
   
    for (const entry of body.entry) {
        const event = entry.messaging && entry.messaging[0];
        console.log(event)
        if (!event) continue;
        const senderId = event.sender && event.sender.id;
        const msg  =  entry.messaging[0].message.text
        // console.log("sg, senderId => ", msg, senderId,body.entry[0].id )
 
    const payload = JSON.stringify({
      type: 'fb-message',
      senderId,
      message: msg,
      timestamp: new Date().toISOString()
    });
    const setStructCrud = {
      pageID: body.entry[0].id,
      text: msg,
      platform: body.object,
      messageType: "client",
      recID: senderId,
    }
    await crudFunc(mongoClient, DB, COLLECTION,setStructCrud);
    for (const client of fastify.websocketServer.clients) {
      if (client.readyState === 1) client.send(payload);
    }
      sendToFacebook(senderId, {text: msg}, setStructCrud, mongoClient, DB, COLLECTION, DEMO_PAGEID,PAGE_ACCESS_TOKEN)

    }
});
 

fastify.listen({ port: 3012, host: '0.0.0.0' }, (err, address) => {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
    fastify.log.info(`Server running at ${address}`);
});
