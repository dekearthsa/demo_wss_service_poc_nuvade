import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import axios from 'axios';
import { MongoClient } from 'mongodb';
// import { randomUUID } from 'crypto';
import cors from '@fastify/cors'
const fastify = Fastify({ logger: true });
fastify.register(cors,{origin: "*"});

const VERIFY_TOKEN = ''
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

const crudFunc = async (data) => {
  try{
    const date = Date.now();

    const payload = {
      text: data.text,
      platform: data.platform,
      messageType: data.messageType,
      recID: data.recID,
      pageID: data.pageID,
      timestamp: date
    }
    const db = mongoClient.db(DB);
    const collection = db.collection(COLLECTION);
    await collection.insertOne(payload);
    return true
  }catch(err){
    console.log(`insert into curdFunc error ${err}`);
    return false
  }
}

fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket, req ) => {
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    fastify.log.info(`[WS] New client connected from ${clientIP}`);
    
    // เก็บ client socket ไว้ใน set
    clients.add(socket);

    // ส่งข้อความต้อนรับ
    socket.send(JSON.stringify({
      type: 'system',
      message: '👋 Connected to WebSocket server!',
      timestamp: new Date().toISOString()
    }));

    // รับข้อความจาก client
    socket.on('message', (msg) => {
      fastify.log.info(`[WS] Message received: ${msg}`);

      // ตอบกลับ
      socket.send(JSON.stringify({
        type: 'echo',
        received: msg.toString(),
        timestamp: new Date().toISOString()
      }));
    });

    // เมื่อปิดการเชื่อมต่อ
    socket.on('close', () => {
      fastify.log.info('[WS] Client disconnected');
      clients.delete(socket);
    });

    // ดักจับ error เพื่อป้องกันการ crash
    socket.on('error', (err) => {
      fastify.log.error('[WS] Error:', err);
      clients.delete(socket);
    });
  });

  // Optional: ฟังก์ชัน broadcast ไปยังทุก client
  fastify.decorate('broadcast', (data) => {
    const msg = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
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
    await crudFunc(setStructCrud);
    for (const client of fastify.websocketServer.clients) {
      if (client.readyState === 1) client.send(payload);
    }
        sendToFacebook(senderId, {text: msg}, setStructCrud)

    }
});

 
async function sendToFacebook(recipientId, text, data) {
    // console.log("text => ", text)
  try {
    const url =  `https://graph.facebook.com/v17.0/642155692311378/messages?access_token=${PAGE_ACCESS_TOKEN}`      
    await axios.post(url, {
      messaging_type: "RESPONSE", 
      recipient: { id: recipientId },
      message:   text
    });

    const payload = JSON.stringify({
      type: 'fb-message',
      recipientId,
      message: `AI: ${text.text}`,
      timestamp: new Date().toISOString()
    });
    for (const client of fastify.websocketServer.clients) {
      if (client.readyState === 1) client.send(payload);
    }
    data.messageType = "AI"
    await crudFunc(data);
    fastify.log.info(`Sent message to ${recipientId}`);
  } catch (err) {
    const fbErr = err.response ? err.response.data : err;
    fastify.log.error("FB Send Error:", fbErr);
  }
}

fastify.listen({ port: 3012, host: '0.0.0.0' }, (err, address) => {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
    fastify.log.info(`Server running at ${address}`);
});
