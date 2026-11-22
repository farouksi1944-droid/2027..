import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ActivityEntry, ChallengeRoom, DuelRecord, PlayerProgress } from './src/types/study.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '.data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

function ensureDataStore(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ROOMS_FILE)) {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function readRooms(): Record<string, ChallengeRoom> {
  ensureDataStore();
  try {
    const raw = fs.readFileSync(ROOMS_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, ChallengeRoom>;
  } catch {
    return {};
  }
}

function writeRooms(rooms: Record<string, ChallengeRoom>): void {
  ensureDataStore();
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2), 'utf-8');
}

function createEmptyPlayer(id: 'player1' | 'player2', name: string): PlayerProgress {
  return {
    id,
    name,
    completedStages: {},
    completedMorningPackets: {},
    completedBlocks: {},
    masteredCards: {},
    duelHighScore: 0,
    duelBestTimeSec: 0,
    duelsPlayed: 0,
    xp: 0,
    lastActiveDate: new Date().toISOString().slice(0, 10),
    activityDates: [],
  };
}

function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-_]/g, '')
    .slice(0, 24);
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/rooms', (req, res) => {
    const body = req.body as {
      code?: string;
      player1Name?: string;
      player2Name?: string;
      initialState?: ChallengeRoom;
    };

    const rawCode = body.code && body.code.trim().length > 0 ? body.code : `BAC-${Math.floor(1000 + Math.random() * 9000)}`;
    const code = normalizeRoomCode(rawCode);
    if (code.length < 3) {
      res.status(400).json({ error: 'رمز الغرفة يجب أن يتكون من 3 أحرف أو أرقام على الأقل.' });
      return;
    }

    const rooms = readRooms();
    if (rooms[code]) {
      res.json({ room: rooms[code], created: false });
      return;
    }

    const p1Name = (body.player1Name || 'فاروق').trim().slice(0, 24) || 'فاروق';
    const p2Name = (body.player2Name || 'سعيد').trim().slice(0, 24) || 'سعيد';

    const room: ChallengeRoom = body.initialState
      ? {
          ...body.initialState,
          code,
        }
      : {
          code,
          createdAt: new Date().toISOString(),
          players: {
            player1: createEmptyPlayer('player1', p1Name),
            player2: createEmptyPlayer('player2', p2Name),
          },
          duelHistory: [],
          activityLog: [
            {
              id: `act-${Date.now()}`,
              playerId: 'player1',
              playerName: p1Name,
              message: `فتح غرفة التحدي (${code}) للاستعداد لامتحان 6 ديسمبر`,
              xpDelta: 0,
              timestamp: new Date().toISOString(),
            },
          ],
        };

    rooms[code] = room;
    writeRooms(rooms);
    res.status(201).json({ room, created: true });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = normalizeRoomCode(req.params.code || '');
    const rooms = readRooms();
    const room = rooms[code];
    if (!room) {
      res.status(404).json({ error: 'لم يتم العثور على غرفة بهذا الرمز.' });
      return;
    }
    res.json({ room });
  });

  app.post('/api/rooms/:code/sync', (req, res) => {
    const code = normalizeRoomCode(req.params.code || '');
    const rooms = readRooms();
    let room = rooms[code];
    if (!room) {
      res.status(404).json({ error: 'الغرفة غير موجودة.' });
      return;
    }

    const body = req.body as {
      playerId: 'player1' | 'player2';
      player: PlayerProgress;
      activity?: ActivityEntry;
      duelRecord?: DuelRecord;
      renameOther?: { playerId: 'player1' | 'player2'; name: string };
    };

    if (body.playerId !== 'player1' && body.playerId !== 'player2') {
      res.status(400).json({ error: 'معرف اللاعب غير صالح.' });
      return;
    }

    if (body.player) {
      room = {
        ...room,
        players: {
          ...room.players,
          [body.playerId]: {
            ...body.player,
            id: body.playerId,
          },
        },
      };
    }

    if (body.renameOther && (body.renameOther.playerId === 'player1' || body.renameOther.playerId === 'player2')) {
      const targetId = body.renameOther.playerId;
      room.players[targetId] = {
        ...room.players[targetId],
        name: body.renameOther.name.trim().slice(0, 24) || room.players[targetId].name,
      };
    }

    if (body.duelRecord) {
      room.duelHistory = [body.duelRecord, ...room.duelHistory].slice(0, 25);
    }

    if (body.activity) {
      room.activityLog = [body.activity, ...room.activityLog].slice(0, 40);
    }

    rooms[code] = room;
    writeRooms(rooms);
    res.json({ room });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
