import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 8099);
const root = process.cwd();
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const relative = pathname === '/' || /^\/sala\/[A-Z2-9]{5}\/?$/i.test(pathname) ? 'index.html' : pathname.slice(1);
  const file = normalize(join(root, relative));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server });
const send = (ws, type, payload = {}) => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ type, ...payload }));
const roomView = (room) => ({
  code: room.code,
  hostId: room.hostId,
  status: room.status,
  players: room.players.map(({ id, name, connected }) => ({ id, name, connected })),
});
const publishRoom = (room) => room.clients.forEach((ws) => send(ws, 'room', { room: roomView(room) }));

wss.on('connection', (ws) => {
  ws.on('message', (buffer) => {
    let message;
    try {
      message = JSON.parse(buffer.toString());
    } catch {
      return send(ws, 'error', { message: 'Mensagem inválida.' });
    }
    if (message.type === 'create_room') {
      let roomCode;
      do roomCode = code();
      while (rooms.has(roomCode));
      const room = {
        code: roomCode,
        hostId: 0,
        nextId: 1,
        status: 'lobby',
        players: [{ id: 0, name: message.name, connected: true }],
        clients: new Set([ws]),
      };
      rooms.set(roomCode, room);
      ws.roomCode = roomCode;
      ws.playerId = 0;
      send(ws, 'joined', { playerId: 0, isHost: true });
      publishRoom(room);
      return;
    }
    if (message.type === 'join_room') {
      const room = rooms.get(String(message.code || '').toUpperCase());
      if (!room) return send(ws, 'error', { message: 'Sala não encontrada.' });
      if (room.status !== 'lobby') return send(ws, 'error', { message: 'A partida já começou.' });
      if (room.players.length >= 6) return send(ws, 'error', { message: 'A sala está cheia.' });
      const player = { id: room.nextId++, name: message.name, connected: true };
      room.players.push(player);
      room.clients.add(ws);
      ws.roomCode = room.code;
      ws.playerId = player.id;
      send(ws, 'joined', { playerId: player.id, isHost: false });
      publishRoom(room);
      return;
    }
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    if (message.type === 'start_game' && ws.playerId === room.hostId && room.players.length >= 2) {
      room.status = 'playing';
      publishRoom(room);
      room.clients.forEach((client) => send(client, 'game_started', { players: room.players, hostId: room.hostId }));
      return;
    }
    if (message.type === 'game_state' && ws.playerId === room.hostId)
      room.clients.forEach((client) => client !== ws && send(client, 'game_state', { state: message.state }));
    if (message.type === 'action') {
      const host = [...room.clients].find((client) => client.playerId === room.hostId);
      if (host)
        send(host, 'remote_action', { playerId: ws.playerId, action: message.action, targetId: message.targetId });
    }
  });
  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    room.clients.delete(ws);
    const player = room.players.find((item) => item.id === ws.playerId);
    if (player) player.connected = false;
    if (!room.clients.size) rooms.delete(room.code);
    else publishRoom(room);
  });
});

server.listen(port, '0.0.0.0', () => console.log(`La Corte em http://localhost:${port}`));
