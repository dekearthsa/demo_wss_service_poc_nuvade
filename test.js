// const ws = new WebSocket("ws://localhost:3012/ws");
const ws = new WebSocket("wss://api.bkkdemoondevearth.work/ws");
ws.onopen = () => ws.send("ping");
ws.onmessage = (e) => console.log("🟢", e.data);
