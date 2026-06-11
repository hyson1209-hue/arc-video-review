// server/src/events.js — SSE 허브
const clients = new Set();

export function sseHandler(req, res) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.write(":ok\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
}

export function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients) c.write(line);
}
