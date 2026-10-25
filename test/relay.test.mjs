import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { connect } from "node:net";
import { PROTOCOL, RELAY_PATH, createRelay, decodeFrames, encodeFrame } from "../server/lagoon/relay.mjs";

// A client frame, masked as browsers send them.
function clientFrame(text) {
  const data = Buffer.from(text);
  const mask = randomBytes(4);
  const masked = Buffer.from(data.map((byte, i) => byte ^ mask[i % 4]));
  return Buffer.concat([Buffer.from([0x81, 0x80 | data.length]), mask, masked]);
}

test("frames round-trip, including two-byte lengths and split frames", () => {
  const long = "x".repeat(300);
  const { frames, rest } = decodeFrames(Buffer.concat([encodeFrame("hi"), encodeFrame(long)]));
  assert.deepEqual(frames.map((f) => [f.opcode, f.payload.toString()]), [[1, "hi"], [1, long]]);
  assert.equal(rest.length, 0);
  const masked = clientFrame('{"type":"ping","id":7}');
  const first = decodeFrames(masked.subarray(0, 5));
  assert.deepEqual([first.frames.length, first.rest.length], [0, 5]);
  assert.equal(decodeFrames(masked).frames[0].payload.toString(), '{"type":"ping","id":7}');
});

test("tickets carry the socket's address and last a minute", () => {
  const relay = createRelay({ lobby: { racingPose: () => null }, now: () => 1000 });
  const { url, ticket, expiresInMs } = relay.authorize("localhost:5180");
  assert.equal(url, `ws://localhost:5180${RELAY_PATH}`);
  assert.match(ticket, /^[0-9a-f-]{36}$/);
  assert.equal(expiresInMs, 60_000);
});

test("samples carry the AI's pose with a rising sequence, or nothing when no room races", () => {
  let racing = null;
  const relay = createRelay({ lobby: { racingPose: () => racing }, now: () => 5000 });
  assert.equal(relay.sample(), null);
  racing = { roomId: "r1", pose: { x: 3 } };
  assert.deepEqual(relay.sample(), { streamId: "ai-r1", seq: 1, capturedAt: 5000, updatedAt: 5000, pose: { x: 3 } });
  assert.equal(relay.sample().seq, 2);
});

// A real server with the relay on its upgrade event, and a raw socket client.
// Upgraded sockets aren't closed by server.close(), so the test ends them.
async function startRelay(t, racingPose) {
  const relay = createRelay({ lobby: { racingPose }, now: Date.now, rate: 50 });
  const server = createServer();
  const sockets = new Set();
  server.on("upgrade", (req, socket) => {
    sockets.add(socket);
    relay.handleUpgrade(req, socket);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    return new Promise((resolve) => server.close(resolve));
  });
  return { relay, port: server.address().port };
}

function openSocket(port, protocols) {
  const key = randomBytes(16).toString("base64");
  const socket = connect(port, "127.0.0.1");
  socket.write([`GET ${RELAY_PATH} HTTP/1.1`, `Host: 127.0.0.1:${port}`, "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Key: ${key}`, "Sec-WebSocket-Version: 13", `Sec-WebSocket-Protocol: ${protocols}`, "", ""].join("\r\n"));
  let buffer = Buffer.alloc(0);
  const messages = [];
  let head = null;
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!head) {
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      head = buffer.subarray(0, end).toString();
      buffer = buffer.subarray(end + 4);
    }
    const { frames, rest } = decodeFrames(buffer);
    buffer = rest;
    for (const frame of frames) messages.push(JSON.parse(frame.payload.toString()));
  });
  const until = async (check) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
  };
  return { socket, messages, until, head: () => head, accept: createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64") };
}

test("a socket with a valid ticket gets ready, pongs and the AI's poses", async (t) => {
  const { relay, port } = await startRelay(t, () => ({ roomId: "r1", pose: { x: 1 } }));
  const { ticket } = relay.authorize(`127.0.0.1:${port}`);
  const client = openSocket(port, `${PROTOCOL}, ticket.${ticket}`);
  t.after(() => client.socket.destroy());
  await client.until(() => client.messages.some((m) => m.type === "pose"));
  assert.match(client.head(), /^HTTP\/1\.1 101/);
  assert.match(client.head(), new RegExp(`Sec-WebSocket-Accept: ${client.accept.replace(/[+/]/g, "\\$&")}`));
  assert.match(client.head(), new RegExp(`Sec-WebSocket-Protocol: ${PROTOCOL}`));
  assert.deepEqual(client.messages[0], { type: "ready" });
  const pose = client.messages.find((m) => m.type === "pose");
  assert.deepEqual([pose.sample.streamId, pose.sample.pose], ["ai-r1", { x: 1 }]);
  client.socket.write(clientFrame('{"type":"ping","id":42}'));
  await client.until(() => client.messages.some((m) => m.type === "pong"));
  assert.deepEqual(client.messages.find((m) => m.type === "pong"), { type: "pong", id: 42 });
});

test("a socket without a valid ticket is refused", async (t) => {
  const { port } = await startRelay(t, () => null);
  const client = openSocket(port, `${PROTOCOL}, ticket.not-a-ticket`);
  t.after(() => client.socket.destroy());
  await client.until(() => client.head());
  assert.match(client.head(), /^HTTP\/1\.1 401/);
});
