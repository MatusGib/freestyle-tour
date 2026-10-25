// A minimal WebSocket relay for the local 1v1, speaking the game's relay
// protocol: the game connects with a ticket from POST /api/lagoons/connect,
// gets "ready", and then the AI's poses about 30 times a second while the room
// races. It answers pings and ignores the game's own poses. No dependencies:
// just the handshake and text frames.
import { createHash, randomUUID } from "node:crypto";

export const PROTOCOL = "fristajlo-v2";
export const RELAY_PATH = "/__relay";
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const TICKET_MS = 60_000;

// A server-to-client text frame.
export function encodeFrame(text, opcode = 0x1) {
  const data = Buffer.from(text);
  const length = data.length;
  let header;
  if (length < 126) header = Buffer.from([0x80 | opcode, length]);
  else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, data]);
}

// Complete frames from the start of buffer (client frames are masked), and the
// bytes left over: { frames: [{ opcode, payload }], rest }.
export function decodeFrames(buffer) {
  const frames = [];
  let at = 0;
  while (buffer.length - at >= 2) {
    const opcode = buffer[at] & 0x0f;
    const masked = buffer[at + 1] & 0x80;
    let length = buffer[at + 1] & 0x7f;
    let head = 2;
    if (length === 126) {
      if (buffer.length - at < 4) break;
      length = buffer.readUInt16BE(at + 2);
      head = 4;
    } else if (length === 127) {
      if (buffer.length - at < 10) break;
      length = Number(buffer.readBigUInt64BE(at + 2));
      head = 10;
    }
    const maskAt = at + head;
    const dataAt = maskAt + (masked ? 4 : 0);
    if (buffer.length < dataAt + length) break;
    const payload = Buffer.from(buffer.subarray(dataAt, dataAt + length));
    if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= buffer[maskAt + (i % 4)];
    frames.push({ opcode, payload });
    at = dataAt + length;
  }
  return { frames, rest: buffer.subarray(at) };
}

// lobby.racingPose() gives { roomId, pose } or null.
export function createRelay({ lobby, now, rate = 30 }) {
  const tickets = new Map();

  // The answer to POST /api/lagoons/connect. host: the request's Host header.
  function authorize(host) {
    for (const [ticket, expires] of tickets) if (expires < now()) tickets.delete(ticket);
    const ticket = randomUUID();
    tickets.set(ticket, now() + TICKET_MS);
    return { url: `ws://${host}${RELAY_PATH}`, ticket, expiresInMs: TICKET_MS };
  }

  // The AI's latest pose as a relay sample, or null when no room races.
  let seq = 0;
  function sample() {
    const current = lobby.racingPose();
    if (!current) return null;
    const t = now();
    return { streamId: `ai-${current.roomId}`, seq: ++seq, capturedAt: t, updatedAt: t, pose: current.pose };
  }

  function handleUpgrade(req, socket) {
    const offered = (req.headers["sec-websocket-protocol"] ?? "").split(",").map((p) => p.trim());
    const ticket = offered.find((p) => p.startsWith("ticket."))?.slice("ticket.".length);
    const path = new URL(req.url, "http://localhost").pathname;
    if (path !== RELAY_PATH || !offered.includes(PROTOCOL) || !tickets.has(ticket) || tickets.get(ticket) < now()) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + GUID).digest("base64");
    socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, `Sec-WebSocket-Protocol: ${PROTOCOL}`, "", ""].join("\r\n"));
    const send = (message) => socket.writable && socket.write(encodeFrame(JSON.stringify(message)));
    send({ type: "ready" });
    const timer = setInterval(() => {
      const next = sample();
      if (next) send({ type: "pose", sample: next });
    }, 1000 / rate);
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      const { frames, rest } = decodeFrames(Buffer.concat([pending, chunk]));
      pending = rest;
      for (const { opcode, payload } of frames) {
        if (opcode === 0x8) socket.end(encodeFrame("", 0x8));
        else if (opcode === 0x9) socket.write(encodeFrame(payload.toString(), 0xa));
        else if (opcode === 0x1) {
          let message;
          try {
            message = JSON.parse(payload.toString());
          } catch {
            continue;
          }
          if (message.type === "ping") send({ type: "pong", id: message.id });
        }
      }
    });
    const stop = () => clearInterval(timer);
    socket.on("close", stop);
    socket.on("error", stop);
  }

  return { authorize, sample, handleUpgrade };
}
