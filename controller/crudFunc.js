const crudFunc = async (mongoClient,DB, COLLECTION,data) => {
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

export default crudFunc