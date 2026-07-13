import { WebSocketServer, WebSocket } from "ws";

// --- Types ---
type VocabItem = { word: string; meaningTh: string; difficulty: string; category: string };

type GameBubble = {
  id: string;
  word: string;
  meaningTh: string;
  difficulty: string;
  x: number;
  y: number;
  choices: string[];
  spawnedAt: number;
  lifetime: number;
};

type Player = {
  ws: WebSocket;
  id: string;
  name: string;
  rating: number;
  score: number;
  combo: number;
  maxCombo: number;
  correct: number;
  wrong: number;
};

type Room = {
  id: string;
  mode: "private" | "ranked";
  players: Map<string, Player>;
  bubbles: Map<string, GameBubble>;
  vocab: VocabItem[];
  gameState: "waiting" | "playing" | "finished";
  startTime: number;
  spawnTimer: ReturnType<typeof setInterval> | null;
  gameTimer: ReturnType<typeof setInterval> | null;
  expireTimer: ReturnType<typeof setInterval> | null;
  bubbleCounter: number;
};

type QueueEntry = {
  ws: WebSocket;
  playerId: string;
  name: string;
  rating: number;
  joinedAt: number;
};

// --- Constants ---
const PORT = 3333;
const GAME_DURATION = 60_000;
const BUBBLE_LIFETIME = 9_000;
const SPAWN_INTERVAL = 1_400;
const MAX_BUBBLES = 10;

const DIFF_POINTS: Record<string, { points: number; penalty: number }> = {
  easy: { points: 10, penalty: -5 },
  medium: { points: 25, penalty: -10 },
  hard: { points: 50, penalty: -20 },
};

// --- Rating ---
function getRank(rating: number): { name: string; badge: string } {
  if (rating >= 1800) return { name: "Diamond", badge: "👑" };
  if (rating >= 1400) return { name: "Platinum", badge: "💎" };
  if (rating >= 1000) return { name: "Gold", badge: "🥇" };
  if (rating >= 600) return { name: "Silver", badge: "🥈" };
  return { name: "Bronze", badge: "🥉" };
}

function calculateRatingChange(myRating: number, opponentRating: number, won: boolean): number {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
  const kFactor = 32;
  const change = Math.round(kFactor * ((won ? 1 : 0) - expected));
  // Clamp: winner gets at least +10, loser loses at most -25
  if (won) return Math.max(10, change);
  return Math.max(-25, Math.min(-5, change));
}

// --- State ---
const rooms = new Map<string, Room>();
const matchQueue: QueueEntry[] = [];
let cachedVocab: VocabItem[] = [];

// --- Helpers ---
function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(id) ? generateRoomId() : id;
}

function generatePlayerId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function broadcast(room: Room, msg: Record<string, unknown>, exclude?: string) {
  const data = JSON.stringify(msg);
  for (const [id, player] of room.players) {
    if (id !== exclude && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}

function send(ws: WebSocket, msg: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function getPlayersInfo(room: Room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    rating: p.rating,
    rank: getRank(p.rating),
    score: p.score,
    combo: p.combo,
    correct: p.correct,
    wrong: p.wrong,
  }));
}

function spawnBubble(room: Room) {
  if (room.bubbles.size >= MAX_BUBBLES || room.vocab.length < 4) return;

  const onBoard = new Set([...room.bubbles.values()].map((b) => b.word));
  const available = room.vocab.filter((v) => !onBoard.has(v.word));
  if (available.length < 4) return;

  const item = available[Math.floor(Math.random() * available.length)];

  const sameCat = room.vocab.filter((v) => v.meaningTh !== item.meaningTh && v.category === item.category);
  const otherCat = room.vocab.filter((v) => v.meaningTh !== item.meaningTh && v.category !== item.category);
  const distractors = [...sameCat.sort(() => Math.random() - 0.5).slice(0, 2),
    ...otherCat.sort(() => Math.random() - 0.5).slice(0, 2)]
    .sort(() => Math.random() - 0.5).slice(0, 3).map((v) => v.meaningTh);
  const choices = [...distractors, item.meaningTh].sort(() => Math.random() - 0.5);

  const id = `b-${room.bubbleCounter++}`;
  const bubble: GameBubble = {
    id, word: item.word, meaningTh: item.meaningTh, difficulty: item.difficulty,
    x: 6 + Math.random() * 88, y: 8 + Math.random() * 78,
    choices, spawnedAt: Date.now(), lifetime: BUBBLE_LIFETIME + Math.random() * 2000,
  };

  room.bubbles.set(id, bubble);
  broadcast(room, {
    type: "bubble_spawn",
    bubble: { id: bubble.id, word: bubble.word, difficulty: bubble.difficulty, x: bubble.x, y: bubble.y, choices: bubble.choices, lifetime: bubble.lifetime },
  });
}

function startGame(room: Room) {
  room.gameState = "playing";
  room.startTime = Date.now();
  room.bubbleCounter = 0;
  room.bubbles.clear();

  for (const player of room.players.values()) {
    player.score = 0;
    player.combo = 0;
    player.maxCombo = 0;
    player.correct = 0;
    player.wrong = 0;
  }

  broadcast(room, { type: "game_start", duration: GAME_DURATION, players: getPlayersInfo(room) });

  for (let i = 0; i < 5; i++) setTimeout(() => spawnBubble(room), i * 300);
  room.spawnTimer = setInterval(() => spawnBubble(room), SPAWN_INTERVAL);

  room.expireTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, bubble] of room.bubbles) {
      if (now - bubble.spawnedAt > bubble.lifetime) {
        room.bubbles.delete(id);
        broadcast(room, { type: "bubble_expired", bubbleId: id });
      }
    }
  }, 300);

  room.gameTimer = setInterval(() => {
    const elapsed = Date.now() - room.startTime;
    const timeLeft = Math.max(0, GAME_DURATION - elapsed);
    broadcast(room, { type: "tick", timeLeft });
    if (timeLeft <= 0) endGame(room);
  }, 200);
}

function endGame(room: Room) {
  room.gameState = "finished";
  if (room.spawnTimer) clearInterval(room.spawnTimer);
  if (room.gameTimer) clearInterval(room.gameTimer);
  if (room.expireTimer) clearInterval(room.expireTimer);

  const players = getPlayersInfo(room);
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  // Calculate rating changes for ranked games
  const ratingChanges: Record<string, number> = {};
  if (room.mode === "ranked" && sorted.length === 2) {
    const [p1, p2] = sorted;
    ratingChanges[p1.id] = calculateRatingChange(p1.rating, p2.rating, true);
    ratingChanges[p2.id] = calculateRatingChange(p2.rating, p1.rating, false);
  }

  broadcast(room, {
    type: "game_over",
    players: sorted,
    winnerId: winner?.id,
    winnerName: winner?.name,
    ratingChanges,
    mode: room.mode,
  });
}

function cleanupRoom(room: Room) {
  if (room.spawnTimer) clearInterval(room.spawnTimer);
  if (room.gameTimer) clearInterval(room.gameTimer);
  if (room.expireTimer) clearInterval(room.expireTimer);
  rooms.delete(room.id);
}

// --- Matchmaking ---
function tryMatchmaking() {
  if (matchQueue.length < 2) return;

  const now = Date.now();

  for (let i = 0; i < matchQueue.length; i++) {
    const p1 = matchQueue[i];
    if (p1.ws.readyState !== WebSocket.OPEN) {
      matchQueue.splice(i, 1); i--; continue;
    }

    const waitTime = now - p1.joinedAt;
    // Widen range over time: start ±100, +100 every 5s
    const range = 100 + Math.floor(waitTime / 5000) * 100;

    let bestMatch = -1;
    let bestDiff = Infinity;

    for (let j = i + 1; j < matchQueue.length; j++) {
      const p2 = matchQueue[j];
      if (p2.ws.readyState !== WebSocket.OPEN) {
        matchQueue.splice(j, 1); j--; continue;
      }

      const diff = Math.abs(p1.rating - p2.rating);
      const p2WaitTime = now - p2.joinedAt;
      const p2Range = 100 + Math.floor(p2WaitTime / 5000) * 100;
      const maxRange = Math.max(range, p2Range);

      if (diff <= maxRange && diff < bestDiff) {
        bestDiff = diff;
        bestMatch = j;
      }
    }

    if (bestMatch >= 0) {
      const p2 = matchQueue[bestMatch];
      matchQueue.splice(bestMatch, 1);
      matchQueue.splice(i, 1);

      createRankedMatch(p1, p2);
      return; // Process one match per tick
    }

    // Notify player of current search range
    send(p1.ws, { type: "match_searching", range, waitTime: Math.round(waitTime / 1000) });
  }
}

async function createRankedMatch(p1: QueueEntry, p2: QueueEntry) {
  const vocab = cachedVocab.length > 0 ? cachedVocab : await fetchVocab();
  if (vocab.length < 10) {
    send(p1.ws, { type: "error", message: "Vocab not loaded" });
    send(p2.ws, { type: "error", message: "Vocab not loaded" });
    return;
  }

  const roomId = generateRoomId();
  const room: Room = {
    id: roomId, mode: "ranked",
    players: new Map(), bubbles: new Map(), vocab,
    gameState: "waiting", startTime: 0,
    spawnTimer: null, gameTimer: null, expireTimer: null, bubbleCounter: 0,
  };

  room.players.set(p1.playerId, {
    ws: p1.ws, id: p1.playerId, name: p1.name, rating: p1.rating,
    score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0,
  });
  room.players.set(p2.playerId, {
    ws: p2.ws, id: p2.playerId, name: p2.name, rating: p2.rating,
    score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0,
  });

  rooms.set(roomId, room);

  // Store roomId on the queue entries' connection context
  playerRoomMap.set(p1.playerId, roomId);
  playerRoomMap.set(p2.playerId, roomId);

  const playersInfo = getPlayersInfo(room);

  send(p1.ws, { type: "match_found", roomId, playerId: p1.playerId, opponent: playersInfo.find((p) => p.id === p2.playerId), players: playersInfo });
  send(p2.ws, { type: "match_found", roomId, playerId: p2.playerId, opponent: playersInfo.find((p) => p.id === p1.playerId), players: playersInfo });

  console.log(`Ranked match: ${p1.name}(${p1.rating}) vs ${p2.name}(${p2.rating}) → Room ${roomId}`);

  // Auto-start with countdown
  setTimeout(() => broadcast(room, { type: "countdown", count: 3 }), 1500);
  setTimeout(() => broadcast(room, { type: "countdown", count: 2 }), 2500);
  setTimeout(() => broadcast(room, { type: "countdown", count: 1 }), 3500);
  setTimeout(() => startGame(room), 4500);
}

// Run matchmaking every 2 seconds
setInterval(tryMatchmaking, 2000);

// --- Fetch vocab ---
async function fetchVocab(): Promise<VocabItem[]> {
  try {
    const res = await fetch("http://localhost:3001/api/vocab");
    const data = await res.json();
    cachedVocab = data.words ?? [];
    return cachedVocab;
  } catch {
    try {
      const res = await fetch("http://localhost:3000/api/vocab");
      const data = await res.json();
      cachedVocab = data.words ?? [];
      return cachedVocab;
    } catch {
      console.error("Could not fetch vocab. Make sure dev server is running.");
      return [];
    }
  }
}

// Pre-fetch vocab on startup
fetchVocab();

// --- Player-Room mapping for matchmaking connections ---
const playerRoomMap = new Map<string, string>();

// --- WebSocket Server ---
const wss = new WebSocketServer({ port: PORT });
console.log(`Game WebSocket server running on ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  let playerId = generatePlayerId();
  let currentRoomId: string | null = null;

  ws.on("message", async (raw) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    const type = msg.type as string;

    // --- Find Match (Ranked) ---
    if (type === "find_match") {
      const name = (msg.name as string) || "Player";
      const rating = (msg.rating as number) ?? 1000;

      // Remove from queue if already in
      const existing = matchQueue.findIndex((e) => e.playerId === playerId);
      if (existing >= 0) matchQueue.splice(existing, 1);

      matchQueue.push({ ws, playerId, name, rating, joinedAt: Date.now() });

      send(ws, { type: "match_searching", range: 100, waitTime: 0 });
      console.log(`${name}(${rating}) joined matchmaking queue (${matchQueue.length} in queue)`);
    }

    // --- Cancel Match ---
    if (type === "cancel_match") {
      const idx = matchQueue.findIndex((e) => e.playerId === playerId);
      if (idx >= 0) matchQueue.splice(idx, 1);
      send(ws, { type: "match_cancelled" });
    }

    // --- Create Room (Private) ---
    if (type === "create_room") {
      const name = (msg.name as string) || "Player 1";
      const vocab = cachedVocab.length > 0 ? cachedVocab : await fetchVocab();

      if (vocab.length < 10) {
        send(ws, { type: "error", message: "Not enough vocab loaded." });
        return;
      }

      const roomId = generateRoomId();
      const room: Room = {
        id: roomId, mode: "private",
        players: new Map(), bubbles: new Map(), vocab,
        gameState: "waiting", startTime: 0,
        spawnTimer: null, gameTimer: null, expireTimer: null, bubbleCounter: 0,
      };

      room.players.set(playerId, {
        ws, id: playerId, name, rating: (msg.rating as number) ?? 1000,
        score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0,
      });

      rooms.set(roomId, room);
      currentRoomId = roomId;

      send(ws, { type: "room_created", roomId, playerId, players: getPlayersInfo(room) });
      console.log(`Room ${roomId} created by ${name}`);
    }

    // --- Join Room (Private) ---
    if (type === "join_room") {
      const roomId = (msg.roomId as string)?.toUpperCase();
      const name = (msg.name as string) || "Player 2";

      const room = rooms.get(roomId);
      if (!room) { send(ws, { type: "error", message: "Room not found" }); return; }
      if (room.gameState !== "waiting") { send(ws, { type: "error", message: "Game already in progress" }); return; }
      if (room.players.size >= 4) { send(ws, { type: "error", message: "Room is full" }); return; }

      room.players.set(playerId, {
        ws, id: playerId, name, rating: (msg.rating as number) ?? 1000,
        score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0,
      });

      currentRoomId = roomId;

      send(ws, { type: "room_joined", roomId, playerId, players: getPlayersInfo(room) });
      broadcast(room, { type: "player_joined", players: getPlayersInfo(room) }, playerId);
      console.log(`${name} joined room ${roomId}`);
    }

    // --- Start Game (Private) ---
    if (type === "start_game") {
      const room = currentRoomId ? rooms.get(currentRoomId) : null;
      if (!room || room.gameState !== "waiting" || room.players.size < 2) return;

      broadcast(room, { type: "countdown", count: 3 });
      setTimeout(() => broadcast(room, { type: "countdown", count: 2 }), 1000);
      setTimeout(() => broadcast(room, { type: "countdown", count: 1 }), 2000);
      setTimeout(() => startGame(room), 3000);
    }

    // --- Answer ---
    if (type === "answer") {
      // Resolve room from either private or ranked
      const resolvedRoomId = currentRoomId ?? playerRoomMap.get(playerId);
      const room = resolvedRoomId ? rooms.get(resolvedRoomId) : null;
      if (!room || room.gameState !== "playing") return;

      const bubbleId = msg.bubbleId as string;
      const choice = msg.choice as string;
      const bubble = room.bubbles.get(bubbleId);

      if (!bubble) { send(ws, { type: "bubble_gone", bubbleId }); return; }

      const player = room.players.get(playerId);
      if (!player) return;

      const isCorrect = choice === bubble.meaningTh;
      const diff = DIFF_POINTS[bubble.difficulty] ?? DIFF_POINTS.medium;

      if (isCorrect) {
        room.bubbles.delete(bubbleId);
        player.combo++;
        if (player.combo > player.maxCombo) player.maxCombo = player.combo;
        const multiplier = Math.min(player.combo, 5);
        const points = diff.points * multiplier;
        player.score += points;
        player.correct++;

        broadcast(room, {
          type: "bubble_popped", bubbleId, playerId,
          playerName: player.name, points, combo: player.combo, multiplier,
          players: getPlayersInfo(room),
        });
      } else {
        // Wrong → remove bubble + penalty
        room.bubbles.delete(bubbleId);
        player.combo = 0;
        player.score += diff.penalty;
        player.wrong++;

        // Tell everyone bubble is gone
        broadcast(room, {
          type: "answer_wrong_remove", bubbleId, playerId,
          playerName: player.name, penalty: diff.penalty,
          correctAnswer: bubble.meaningTh, players: getPlayersInfo(room),
        });
      }
    }
  });

  ws.on("close", () => {
    // Remove from matchmaking queue
    const qIdx = matchQueue.findIndex((e) => e.playerId === playerId);
    if (qIdx >= 0) matchQueue.splice(qIdx, 1);

    // Handle room disconnect
    const resolvedRoomId = currentRoomId ?? playerRoomMap.get(playerId);
    if (!resolvedRoomId) return;
    const room = rooms.get(resolvedRoomId);
    if (!room) return;

    room.players.delete(playerId);
    playerRoomMap.delete(playerId);
    console.log(`Player ${playerId} disconnected from room ${resolvedRoomId}`);

    if (room.players.size === 0) {
      cleanupRoom(room);
    } else {
      broadcast(room, { type: "player_left", playerId, players: getPlayersInfo(room) });
      if (room.gameState === "playing" && room.players.size < 2) {
        endGame(room);
      }
    }
  });
});
