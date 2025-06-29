import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import axios from 'axios';
import { randomUUID } from 'crypto';
import cors from '@fastify/cors'
const fastify = Fastify({ logger: true });
fastify.register(cors,{origin: "*"});

const VERIFY_TOKEN = ''
const PAGE_ACCESS_TOKEN = ''

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
        
        if (!event) continue;
        const senderId = event.sender && event.sender.id;
        const msg  =  entry.messaging[0].message.text
        console.log("sg, senderId => ", msg, senderId)
 
    const payload = JSON.stringify({
      type: 'fb-message',
      senderId,
      message: msg,
      timestamp: new Date().toISOString()
    });
    for (const client of fastify.websocketServer.clients) {
      if (client.readyState === 1) client.send(payload);
    }
        sendToFacebook(senderId, {text: msg})
 
    }
});

 
async function sendToFacebook(recipientId, text) {
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
