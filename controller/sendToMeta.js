
import axios from "axios";
import crudFunc from "./crudFunc.js";


const  sendToFacebook = async (
    recipientId, 
    text, 
    data, 
    mongoClient, 
    DB, 
    COLLECTION, 
    DEMO_PAGEID,
    PAGE_ACCESS_TOKEN
) =>  {
  try {
    const url =  `https://graph.facebook.com/v17.0/${DEMO_PAGEID}/messages?access_token=${PAGE_ACCESS_TOKEN}`      
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
    await crudFunc(mongoClient, DB, COLLECTION,data);
  } catch (err) {
    const fbErr = err.response ? err.response.data : err;
  }
}

export default sendToFacebook
