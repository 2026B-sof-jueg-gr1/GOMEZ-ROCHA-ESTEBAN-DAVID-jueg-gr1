const COLS = 4;
const W = 400, H = 600;
const COL_W = W / COLS;
const TILE_H = 150;
const KEYS = ['D', 'F', 'J', 'K'];

// Resolución interna: el juego se dibuja a 2x-3x y se reduce, así se ve nítido
const SCALE = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));

// Todo el texto se rasteriza a la resolución alta
const _addText = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
  return _addText.call(this, x, y, text, Object.assign({ resolution: SCALE }, style));
};

// Mantiene tus coordenadas 400x600 aunque el canvas sea más grande
function setupCamera(scene) {
  scene.cameras.main.setZoom(SCALE).centerOn(W / 2, H / 2);
}

const LIFE_MAX = 300;
const LIFE_PENALTY = 20;
const SCORE_PENALTY = 1;

const PRAISE = ['¡Muy bien!', '¡Genial!', '¡Increíble!', '¡Perfecto!'];
const PRAISE_EC = ['¡Chévere!', '¡Bacán!', '¡De una!', '¡Qué fino!'];
const PRAISE_COLORS = ['#fde047', '#ffffff', '#fb7185', '#34d399'];

/* ---------------- RITMO (nivel demo) ---------------- */
// Ajuste fino de sincronía en segundos.
// Si las baldosas llegan a la línea DESPUÉS de oír el golpe: usa un valor negativo (ej. -0.05).
// Si llegan ANTES: usa un valor positivo (ej. 0.05).
const AUDIO_OFFSET = 0;

// Ventanas de tiempo (segundos) para juzgar cada toque
const WIN_PERFECT = 0.07;
const WIN_GOOD = 0.15;
const WIN_OK = 0.30; // fuera de esto: temprano (se ignora) o fallo (pierdes vida)

// Mapa generado analizando audio/recall.mp3 (≈128 BPM, un toque por beat)
const RECALL_MAP = {
  times: [
    3.808, 4.275, 4.741, 5.208, 5.674, 6.141, 6.608, 7.074, 7.541, 8.007,
    8.474, 8.941, 9.407, 9.874, 10.34, 10.807, 11.273, 11.74, 12.207, 12.673,
    13.14, 13.606, 14.073, 14.54, 15.006, 15.473, 15.939, 16.406, 16.872, 17.339,
    17.806, 18.272, 18.739, 19.205, 19.672, 20.139, 20.605, 21.072, 21.538, 22.005,
    22.471, 22.938, 23.405, 23.871, 24.338, 24.804, 25.271, 25.737, 26.204, 26.671,
    27.137, 27.604, 28.07, 28.537, 29.004
  ],
  cols: [
    3, 2, 2, 3, 3, 2, 1, 2, 0, 0,
    1, 0, 1, 2, 1, 1, 2, 1, 2, 0,
    1, 0, 1, 0, 0, 1, 1, 0, 0, 1,
    3, 3, 2, 0, 1, 2, 2, 0, 2, 1,
    1, 2, 2, 3, 3, 0, 1, 3, 3, 2,
    3, 3, 2, 3, 3
  ]
};

/* ---------------- RUTA ECUADOR: sanjuanito original ----------------
   Composición propia en La menor (pentatónica andina), compás de 2/4.
   El acompañamiento (bombo, bajo, charango, rallador, rondador) se sintetiza con
   WebAudio y suena solo; la MELODÍA la tocas tú: cada baldosa es una nota. */
const ECU_BPM = 96;
const ECU_BEAT = 60 / ECU_BPM;  // negra
const ECU_EIGHTH = ECU_BEAT / 2; // corchea
const ECU_BAR = ECU_BEAT * 2;    // un compás de 2/4
const ECU_LEAD = 2;              // segundos de entrada antes del primer compás
const SYNTH_OFFSET = 0;          // ajuste fino de sincronía (igual que AUDIO_OFFSET)

const ECU_NOTES = { a: 440.0, c: 523.25, d: 587.33, e: 659.25, g: 783.99, A: 880.0 };
const ECU_COL = { a: 0, c: 1, d: 1, e: 2, g: 3, A: 3 };

// 24 compases, 4 corcheas por compás. '.' = silencio. A mayúscula = La agudo.
const ECU_BARS = [
  'e.ed', 'c.a.', 'd.dc', 'a...', 'e.eg', 'A.ge', 'd.cd', 'e...',
  'A.Ag', 'e.g.', 'A.ge', 'd.e.', 'g.ge', 'd.ca', 'c.de', 'a...',
  'edcd', 'e.e.', 'gegA', 'g.e.', 'dedc', 'acde', 'gedc', 'a...'
];

// Progresión de 4 compases: Am | Dm | E | Am  → [fundamental del bajo, quinta del acorde]
const ECU_PROG = [
  [110.0, 329.63],
  [146.83, 440.0],
  [164.81, 493.88],
  [110.0, 329.63]
];

function buildEcuMap() {
  const times = [], cols = [], freqs = [];
  ECU_BARS.forEach((bar, b) => {
    for (let s = 0; s < 4; s++) {
      const ch = bar[s];
      if (ch === '.') continue;
      times.push(+((b * 4 + s) * ECU_EIGHTH).toFixed(4));
      cols.push(ECU_COL[ch]);
      freqs.push(ECU_NOTES[ch]);
    }
  });
  return { times, cols, freqs };
}
const ECU_MAP = buildEcuMap();
const ECU_LENGTH = ECU_BARS.length * ECU_BAR; // ≈ 30 s

const MODES = {
  demo: {
    label: 'DEMO', music: 'recall', rhythm: true, map: RECALL_MAP,
    songTitle: 'RECALL', songSub: '(Demostración)',
    tileH: 120, fall: 300, hitY: 510,
    hueSpeed: 4, satStart: 0.35, satGrow: 0.002, satMax: 0.55,
    lightStart: 0.85, lightDrop: 0.0005, lightMin: 0.75
  },
  ecuador: {
    label: 'ECUADOR', rhythm: true, synth: true, map: ECU_MAP,
    songTitle: 'AMANECER ANDINO', songSub: '(Sanjuanito · composición original)',
    tileH: 80, fall: 280, hitY: 510, offset: SYNTH_OFFSET, length: ECU_LENGTH,
    praise: PRAISE_EC, tileColor: 0x1c1208, tileStroke: 0xf2a900,
    // Del cielo nocturno al amanecer andino
    palette: [0x14213d, 0x4a2c6b, 0xc2410c, 0xf59e0b, 0xfde68a]
  },
  chaos: {
    label: 'CAÓTICO', speed: 250, accel: 8, maxSpeed: Infinity, goal: null, music: null,
    hueSpeed: 12, satStart: 0.25, satGrow: 0.012, satMax: 0.9,
    lightStart: 0.82, lightDrop: 0.004, lightMin: 0.55
  }
};

/* ---------------- UTILIDADES ---------------- */
function formatTime(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = (s % 60).toFixed(1).padStart(4, '0');
  return m + ':' + rest;
}

function loadBest(mode) {
  try { return parseInt(localStorage.getItem('pt_best_' + mode), 10) || 0; }
  catch (e) { return 0; }
}

function saveBest(mode, score) {
  try {
    if (score > loadBest(mode)) {
      localStorage.setItem('pt_best_' + mode, String(score));
      return true;
    }
  } catch (e) { /* sin almacenamiento */ }
  return false;
}

/* ---------------- DECORACIÓN ANDINA ---------------- */
// Chakana (cruz andina escalonada) con el centro hueco
function drawChakana(scene, x, y, u, color, depth = 1) {
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(color, 1);
  g.fillRect(x - u, y - 3 * u, 2 * u, 6 * u);
  g.fillRect(x - 3 * u, y - u, 6 * u, 2 * u);
  g.fillRect(x - 2 * u, y - 2 * u, 4 * u, 4 * u);
  g.fillStyle(0x0f172a, 1);
  g.fillCircle(x, y, u * 0.8);
  return g;
}

// Franja de triángulos de colores, inspirada en los tejidos andinos
function drawTextileBand(scene, x0, y, width, h, depth = 1) {
  const colors = [0xdc2626, 0xfacc15, 0x2563eb, 0x16a34a];
  const n = Math.floor(width / h);
  const g = scene.add.graphics().setDepth(depth);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * h;
    g.fillStyle(colors[i % 4], 1);
    g.fillTriangle(x, y + h, x + h / 2, y, x + h, y + h);
  }
  g.fillStyle(0xfacc15, 1);
  g.fillRect(x0, y + h - 2, n * h, 2);
  return g;
}

/* ---------------- SONIDO (WebAudio) ---------------- */
let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function audioLatency() {
  return audioCtx ? (audioCtx.outputLatency || 0) : 0;
}

function tone(freq, dur = 0.18, type = 'triangle', vol = 0.18, when = 0) {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const KEY_FREQS = [523.25, 587.33, 659.25, 783.99]; // C5 D5 E5 G5
function playKey(col) { tone(KEY_FREQS[col], 0.2, 'triangle', 0.22); }
function playError() {
  tone(110, 0.25, 'sawtooth', 0.18);
  tone(98, 0.25, 'square', 0.08);
}
function playWin() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.3, 'triangle', 0.2, i * 0.12));
}
function playLose() {
  [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.12, i * 0.14));
}

/* ---- Instrumentos andinos sintetizados (todos reciben tiempo absoluto "at") ---- */

// Charango: cuerdas dobles, brillante y de decaimiento rápido
function pluckAt(ctx, dest, freq, at, dur, vol) {
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  lp.Q.value = 0.7;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  [['triangle', 0, 1], ['sawtooth', 9, 0.35]].forEach(([type, cents, level]) => {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    og.gain.value = level;
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    o.detune.value = cents;
    o.connect(og);
    og.connect(lp);
    o.start(at);
    o.stop(at + dur + 0.05);
  });
  lp.connect(g);
  g.connect(dest);
}

// Rondador (zampoña ecuatoriana): tono de flauta suave con un armónico
function rondadorAt(ctx, dest, freq, at, dur, vol) {
  const att = Math.min(0.07, dur * 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + att);
  g.gain.setValueAtTime(vol, at + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  g2.gain.value = 0.25;
  o1.type = 'sine';
  o2.type = 'sine';
  o1.frequency.setValueAtTime(freq, at);
  o2.frequency.setValueAtTime(freq * 2, at);
  o1.connect(g);
  o2.connect(g2);
  g2.connect(g);
  g.connect(dest);
  o1.start(at); o2.start(at);
  o1.stop(at + dur + 0.05); o2.stop(at + dur + 0.05);
}

// Bombo legüero
function bomboAt(ctx, dest, at, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, at);
  o.frequency.exponentialRampToValueAtTime(48, at + 0.16);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
  o.connect(g);
  g.connect(dest);
  o.start(at);
  o.stop(at + 0.3);
}

// Bajo
function bassAt(ctx, dest, freq, at, dur, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(dest);
  o.start(at);
  o.stop(at + dur + 0.03);
}

// Rallador / maraca: ruido filtrado
let noiseBuf = null;
function getNoise(ctx) {
  if (!noiseBuf) {
    const len = Math.floor(ctx.sampleRate * 0.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function shakerAt(ctx, dest, at, vol) {
  const s = ctx.createBufferSource();
  s.buffer = getNoise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  s.connect(hp);
  hp.connect(g);
  g.connect(dest);
  s.start(at);
  s.stop(at + 0.08);
}

// Nota de la melodía que toca el jugador
function playMelodyNote(freq) {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  pluckAt(ctx, ctx.destination, freq, t, 0.55, 0.22);
  rondadorAt(ctx, ctx.destination, freq * 2, t, 0.35, 0.03);
}

// Programa todo el acompañamiento del sanjuanito de una sola vez
function scheduleSanjuanito(ctx, dest, t0) {
  ECU_BARS.forEach((_, b) => {
    const [root, fifth] = ECU_PROG[b % 4];
    const bt = t0 + b * ECU_BAR;

    // Bombo en el 1 y en la última corchea
    [0, 3].forEach(s => bomboAt(ctx, dest, bt + s * ECU_EIGHTH, s === 0 ? 0.5 : 0.3));
    // Bajo
    [0, 2].forEach(s => bassAt(ctx, dest, root, bt + s * ECU_EIGHTH, ECU_EIGHTH * 1.8, 0.2));
    // Rasgueo de charango a contratiempo
    [1, 3].forEach(s => {
      [root * 2, fifth, root * 4].forEach((f, i) => {
        pluckAt(ctx, dest, f, bt + s * ECU_EIGHTH + i * 0.012, 0.3, 0.07);
      });
    });
    // Rallador en cada corchea
    for (let s = 0; s < 4; s++) {
      shakerAt(ctx, dest, bt + s * ECU_EIGHTH, s % 2 === 0 ? 0.07 : 0.04);
    }
    // El rondador entra en la segunda parte
    if (b >= 8) rondadorAt(ctx, dest, root * 4, bt, ECU_BAR * 0.95, 0.045);
  });
}

/* ---------------- PANTALLA DE INICIO ---------------- */
class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    setupCamera(this);
    this.started = false;
    this.add.rectangle(0, 0, W, H, 0x0f172a).setOrigin(0);

    this.add.text(W / 2, 65, 'PIANO\nTILES', {
      fontSize: '52px', color: '#ffffff', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5);

    drawChakana(this, 42, 65, 7, 0xf59e0b);
    drawChakana(this, W - 42, 65, 7, 0xf59e0b);

    for (let i = 0; i < COLS; i++) {
      this.add.rectangle(i * COL_W + COL_W / 2, 165, COL_W - 10, 50, 0x1e293b)
        .setStrokeStyle(2, 0x22c55e);
      this.add.text(i * COL_W + COL_W / 2, 165, KEYS[i], {
        fontSize: '28px', color: '#22c55e', fontStyle: 'bold'
      }).setOrigin(0.5);
    }

    this.add.text(W / 2, 270,
      'Toca la baldosa NEGRA más baja.\n' +
      'Clic / tap en la columna o teclas D F J K\n' +
      'Cada error resta 20 de vida (tienes 300)\n' +
      'P = Pausa (reiniciar / salir)', {
        fontSize: '16px', color: '#e2e8f0', align: 'center', lineSpacing: 6
      }).setOrigin(0.5);

    this.add.text(W / 2, 345, 'ELIGE UN MODO', {
      fontSize: '16px', color: '#94a3b8', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.makeButton(388, 0x22c55e, 'DEMOSTRACIÓN  [1]',
      'Ritmo · ' + RECALL_MAP.times.length + ' baldosas · Mejor: ' + loadBest('demo'), 'demo');
    this.makeButton(456, 0xe11d48, 'MODO CAÓTICO  [2]',
      'Sin límite · Mejor: ' + loadBest('chaos'), 'chaos');
    this.makeButton(524, 0xb45309, 'RUTA ECUADOR  [3]',
      'Sanjuanito · ' + ECU_MAP.times.length + ' baldosas · Mejor: ' + loadBest('ecuador'), 'ecuador');

    this.add.text(W / 2, 576, 'Música: Recall (NCS) · Amanecer Andino (original)', {
      fontSize: '11px', color: '#64748b'
    }).setOrigin(0.5);

    drawTextileBand(this, 0, 588, W, 12);

    this.input.keyboard.on('keydown-ONE', () => this.startGame('demo'));
    this.input.keyboard.on('keydown-TWO', () => this.startGame('chaos'));
    this.input.keyboard.on('keydown-THREE', () => this.startGame('ecuador'));
  }

  makeButton(y, color, title, subtitle, mode) {
    const btn = this.add.rectangle(W / 2, y, 340, 60, color)
      .setInteractive({ useHandCursor: true });
    this.add.text(W / 2, y - 10, title, {
      fontSize: '21px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(W / 2, y + 15, subtitle, {
      fontSize: '13px', color: '#ffffff'
    }).setOrigin(0.5).setAlpha(0.9);
    btn.on('pointerover', () => btn.setScale(1.04));
    btn.on('pointerout', () => btn.setScale(1));
    btn.on('pointerdown', () => this.startGame(mode));
  }

  startGame(mode) {
    if (this.started) return;
    this.started = true;
    getCtx(); // desbloquea el audio con el gesto del usuario
    this.scene.start('Game', { mode });
  }
}

/* ---------------- JUEGO ---------------- */
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data) {
    this.mode = (data && data.mode) || 'chaos';
    this.cfg = MODES[this.mode];
  }

  preload() {
    // Coloca tu archivo en audio/recall.mp3 (los 30 s de la canción)
    if (this.cfg.music && !this.cache.audio.exists(this.cfg.music)) {
      this.load.audio(this.cfg.music, 'audio/' + this.cfg.music + '.mp3');
    }
  }

  create() {
    setupCamera(this);
    this.rows = [];
    this.notes = [];
    this.score = 0;
    this.speed = this.cfg.speed || 250;
    this.elapsed = 0;
    this.songTime = this.cfg.synth ? -ECU_LEAD : 0;
    this.nextBeat = 0;
    this.musicDone = false;
    this.life = LIFE_MAX;
    this.streak = 0;
    this.over = false;
    this.paused = false;
    this.overTime = 0;
    this.music = null;
    this.bus = null;
    this.t0 = null;
    this.newRecord = false;
    this.hits = 0;
    this.maxStreak = 0;
    this.perfects = 0;
    this.winScreen = false;
    this.total = this.cfg.rhythm ? this.cfg.map.times.length : (this.cfg.goal || 0);

    // Fondo dinámico
    this.bg = this.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0).setDepth(0);

    // Burbujas que suben (la Ruta Ecuador usa paisaje en su lugar)
    this.bubbles = [];
    if (!this.cfg.palette) {
      for (let i = 0; i < 10; i++) {
        const b = this.add.circle(
          Phaser.Math.Between(0, W), Phaser.Math.Between(0, H),
          Phaser.Math.Between(12, 40), 0xffffff, 0.15
        ).setDepth(1);
        this.bubbles.push({ obj: b, vy: Phaser.Math.Between(20, 60) });
      }
    }

    // Pulso de luz (aciertos / beat)
    this.pulse = this.add.rectangle(0, 0, W, H, 0xffffff, 0).setOrigin(0).setDepth(1);

    // Paisaje andino: estrellas, sol naciente, volcán y Quito
    if (this.cfg.palette) this.buildAndes();

    // Líneas divisorias
    for (let i = 1; i < COLS; i++) {
      this.add.rectangle(i * COL_W, 0, 2, H, 0xffffff, 0.5).setOrigin(0.5, 0).setDepth(1.7);
    }

    if (this.cfg.rhythm) {
      this.buildRhythmTiles();
    } else {
      // Filas iniciales (la de abajo es de arranque)
      for (let i = 0; i < 6; i++) this.addRow(H - TILE_H * (i + 1));
      this.rows[0].hit = true;
      this.rows[0].rect.setFillStyle(0xffffff, 0.35);
    }

    // Letras de las columnas
    for (let i = 0; i < COLS; i++) {
      this.add.text(i * COL_W + COL_W / 2, H - 22, KEYS[i], {
        fontSize: '20px', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5).setAlpha(0.7).setDepth(5);
    }

    // HUD
    this.scoreText = this.add.text(W / 2, 8, this.scoreLabel(), {
      fontSize: '48px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5
    }).setOrigin(0.5, 0).setDepth(10);

    this.add.text(10, 12, this.cfg.label, {
      fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3
    }).setDepth(10);

    this.timeText = this.add.text(W - 10, 12, '0:00.0', {
      fontSize: '18px', color: '#ffffff', stroke: '#000000', strokeThickness: 3
    }).setOrigin(1, 0).setDepth(10);

    // Barra de vida
    this.add.rectangle(50, 80, 300, 16, 0x000000, 0.5).setOrigin(0, 0.5).setDepth(10);
    this.lifeFill = this.add.rectangle(50, 80, 300, 16, 0x22c55e).setOrigin(0, 0.5).setDepth(11);
    this.lifeText = this.add.text(W / 2, 80, '', {
      fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(12);
    this.updateLife();

    // Menú de pausa
    this.buildPauseUI();

    // Entrada
    this.input.on('pointerdown', (p, over) => {
      if (over && over.length) return; // clic sobre un botón
      this.handleTap(Math.floor(p.worldX / COL_W));
    });
    this.input.keyboard.on('keydown', (e) => {
      const key = e.key.toUpperCase();
      if (key === 'P') { this.togglePause(); return; }
      if (this.paused || this.over) {
        if (key === 'R') { this.scene.restart({ mode: this.mode }); return; }
        if (key === 'M') { this.scene.start('Menu'); return; }
      }
      const i = KEYS.indexOf(key);
      if (i >= 0) this.handleTap(i);
    });

    // Con música sintetizada el reloj es el del audio: si la pestaña se oculta, pausamos
    if (this.cfg.synth) {
      const autoPause = () => { if (!this.paused && !this.over) this.togglePause(); };
      this.game.events.on(Phaser.Core.Events.HIDDEN, autoPause);
      this.events.once('shutdown', () => this.game.events.off(Phaser.Core.Events.HIDDEN, autoPause));
    }

    // Música
    this.startMusic();
    this.events.once('shutdown', () => this.stopMusic());
  }

  /* ---- Paisaje andino (Ruta Ecuador) ---- */
  buildAndes() {
    this.stars = [];
    for (let i = 0; i < 30; i++) {
      this.stars.push(this.add.circle(
        Phaser.Math.Between(5, W - 5), Phaser.Math.Between(5, 300),
        Phaser.Math.Between(1, 2), 0xffffff, 0.9
      ).setDepth(1));
    }

    // Sol naciente (sube con el avance de la canción)
    this.sunGlow = this.add.circle(130, 640, 62, 0xfde68a, 0.25).setDepth(1.1);
    this.sun = this.add.circle(130, 640, 36, 0xfff3b0, 1).setDepth(1.2);

    // Cordillera y volcán nevado (tipo Cotopaxi)
    const g = this.add.graphics().setDepth(1.5);
    g.fillStyle(0x3b2f5c, 0.9);
    g.fillTriangle(-40, 600, 70, 440, 180, 600);
    g.fillTriangle(110, 600, 215, 470, 320, 600);
    g.fillTriangle(300, 600, 390, 450, 480, 600);
    g.fillStyle(0x2a2347, 1);
    g.fillTriangle(215, 600, 315, 400, 415, 600);
    g.fillStyle(0xf8fafc, 0.95);
    g.fillTriangle(315, 400, 285, 460, 345, 460);

    // Quito: casas coloniales, Basílica del Voto Nacional y el Panecillo con la Virgen
    const q = this.add.graphics().setDepth(1.6);
    q.fillStyle(0x0d0b16, 1);
    q.fillRect(0, 565, 150, 35);
    q.fillRect(8, 552, 24, 13);
    q.fillCircle(52, 556, 12);
    q.fillRect(40, 556, 24, 12);
    q.fillRect(80, 520, 14, 45);
    q.fillTriangle(78, 520, 87, 486, 96, 520);
    q.fillRect(112, 520, 14, 45);
    q.fillTriangle(110, 520, 119, 486, 128, 520);
    q.fillRect(94, 535, 18, 30);
    q.fillEllipse(335, 612, 220, 150);
    q.fillRect(333, 520, 4, 17);
    q.fillCircle(335, 517, 3.5);
    q.fillTriangle(335, 524, 324, 516, 331, 534);
    q.fillTriangle(335, 524, 346, 516, 339, 534);
  }

  updateAndes(prog) {
    this.sun.y = 640 - 320 * prog;
    this.sunGlow.y = this.sun.y;
    const a = Phaser.Math.Clamp(1 - prog * 2.2, 0, 1) * 0.9;
    this.stars.forEach(s => s.setAlpha(a));
  }

  /* ---- Construcción de baldosas ---- */
  buildRhythmTiles() {
    const h = this.cfg.tileH;
    const hitY = this.cfg.hitY;
    const map = this.cfg.map;
    const offset = this.cfg.offset !== undefined ? this.cfg.offset : AUDIO_OFFSET;

    // Línea de golpeo
    this.add.rectangle(0, hitY, W, 4, 0xffffff, 0.9).setOrigin(0, 0.5).setDepth(3);

    map.times.forEach((t, i) => {
      const col = map.cols[i];
      const rect = this.add.rectangle(col * COL_W, -200, COL_W, h, this.cfg.tileColor || 0x111111)
        .setOrigin(0, 0.5).setDepth(2);
      if (this.cfg.tileStroke) rect.setStrokeStyle(2, this.cfg.tileStroke, 0.9);
      this.notes.push({
        time: t + offset, col, rect, hit: false,
        freq: map.freqs ? map.freqs[i] : null
      });
    });
  }

  addRow(top) {
    const col = Phaser.Math.Between(0, COLS - 1);
    const rect = this.add.rectangle(col * COL_W, top, COL_W, TILE_H, 0x111111)
      .setOrigin(0, 0).setDepth(2);
    this.rows.push({ rect, col, hit: false });
  }

  /* ---- Música ---- */
  startMusic() {
    if (this.cfg.synth) { this.startSynth(); return; }
    if (!this.cfg.music) return;
    if (this.cache.audio.exists(this.cfg.music)) {
      this.music = this.sound.add(this.cfg.music, { loop: !this.cfg.rhythm, volume: 0.6 });
      this.music.once('complete', () => { this.musicDone = true; });
      this.music.play();
    } else {
      this.add.text(W / 2, 108, 'Falta audio/recall.mp3 (sin sincronía)', {
        fontSize: '13px', color: '#ffffff', backgroundColor: '#e11d48'
      }).setOrigin(0.5).setDepth(12);
    }
  }

  startSynth() {
    const ctx = getCtx();
    if (!ctx) return; // sin WebAudio el juego corre sin sonido
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(ctx.destination);
    this.t0 = ctx.currentTime + ECU_LEAD;
    scheduleSanjuanito(ctx, this.bus, this.t0);
  }

  stopMusic() {
    if (this.bus) {
      try { this.bus.disconnect(); } catch (e) { /* ya desconectado */ }
      this.bus = null;
    }
    if (this.music) {
      this.music.stop();
      this.music.destroy();
      this.music = null;
    }
  }

  /* ---- HUD ---- */
  scoreLabel() {
    return this.total ? this.score + ' / ' + this.total : String(this.score);
  }

  updateLife() {
    const life = Math.max(this.life, 0);
    const f = life / LIFE_MAX;
    const color = f > 0.5 ? 0x22c55e : f > 0.25 ? 0xfacc15 : 0xef4444;
    this.lifeFill.setScale(f, 1).setFillStyle(color);
    this.lifeText.setText('VIDA ' + life);
  }

  clockMs() {
    return this.cfg.rhythm ? Math.max(0, this.songTime) * 1000 : this.elapsed;
  }

  togglePause() {
    if (this.over) return;
    this.paused = !this.paused;
    this.setPauseUI(this.paused);
    if (this.music) this.paused ? this.music.pause() : this.music.resume();
    // La música sintetizada se congela suspendiendo el reloj de audio
    if (this.cfg.synth && audioCtx) {
      this.paused ? audioCtx.suspend() : audioCtx.resume();
    }
  }

  updateBackground() {
    const c = this.cfg;

    if (c.palette) {
      const prog = Phaser.Math.Clamp((this.songTime + ECU_LEAD) / (c.length + ECU_LEAD), 0, 1);
      const seg = prog * (c.palette.length - 1);
      const i = Math.min(Math.floor(seg), c.palette.length - 2);
      const f = seg - i;
      const a = Phaser.Display.Color.IntegerToColor(c.palette[i]);
      const b = Phaser.Display.Color.IntegerToColor(c.palette[i + 1]);
      const m = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.round(f * 100));
      this.bg.setFillStyle(Phaser.Display.Color.GetColor(m.r, m.g, m.b));
      this.updateAndes(prog);
      return;
    }

    const t = this.elapsed / 1000;
    const hue = ((t * c.hueSpeed) % 360) / 360;
    const sat = Math.min(c.satStart + t * c.satGrow, c.satMax);
    const light = Math.max(c.lightStart - t * c.lightDrop, c.lightMin);
    this.bg.setFillStyle(Phaser.Display.Color.HSLToColor(hue, sat, light).color);
  }

  moveBubbles(delta) {
    const factor = this.cfg.rhythm ? 1.2 : this.speed / 250;
    this.bubbles.forEach(b => {
      b.obj.y -= b.vy * factor * delta / 1000;
      if (b.obj.y < -50) {
        b.obj.y = H + 50;
        b.obj.x = Phaser.Math.Between(0, W);
      }
    });
  }

  /* ---- Bucle principal ---- */
  update(time, delta) {
    if (this.over || this.paused) return;

    this.elapsed += delta;
    this.updateBackground();
    this.moveBubbles(delta);

    if (this.cfg.rhythm) this.updateRhythm(delta);
    else this.updateClassic(delta);

    this.timeText.setText(formatTime(this.clockMs()));
  }

  /* ---- Modo clásico (caótico) ---- */
  updateClassic(delta) {
    const dy = this.speed * delta / 1000;
    this.rows.forEach(r => r.rect.y += dy);

    const top = this.rows[this.rows.length - 1];
    if (top.rect.y > -TILE_H) this.addRow(top.rect.y - TILE_H);

    const first = this.rows[0];
    if (first.rect.y > H) {
      if (!first.hit) {
        first.hit = true;
        first.rect.setFillStyle(0xe11d48);
        this.penalize(first.col);
      } else {
        first.rect.destroy();
        this.rows.shift();
      }
    }
  }

  /* ---- Modo ritmo (demo y Ruta Ecuador) ---- */
  // Tiempo de la canción sintetizada según el reloj de audio (compensando la latencia de salida)
  synthTime(delta) {
    if (audioCtx && this.t0 !== null) {
      return audioCtx.currentTime - this.t0 - audioLatency();
    }
    return this.songTime + delta / 1000; // sin audio: reloj normal
  }

  currentSongTime() {
    return this.cfg.synth ? this.synthTime(0) : this.songTime;
  }

  advanceClock(delta) {
    if (this.cfg.synth) {
      this.songTime = this.synthTime(delta);
    } else if (this.music && this.music.isPlaying) {
      // El reloj sigue al audio: así las baldosas nunca se desfasan de la música
      this.songTime = Math.max(this.songTime, this.music.seek);
    } else if (!this.music || this.musicDone) {
      this.songTime += delta / 1000; // sin audio: reloj normal
    }
  }

  updateRhythm(delta) {
    this.advanceClock(delta);
    const t = this.songTime;
    const fall = this.cfg.fall;
    const hitY = this.cfg.hitY;

    // Posición de cada baldosa según el tiempo de la canción
    this.notes.forEach(n => {
      n.rect.y = hitY - (n.time - t) * fall;
      n.rect.setVisible(n.rect.y > -80 && n.rect.y < H + 80);
    });

    // Pulso de fondo en cada beat
    while (this.nextBeat < this.notes.length && t >= this.notes[this.nextBeat].time) {
      this.tweens.add({ targets: this.pulse, alpha: { from: 0.18, to: 0 }, duration: 200 });
      this.nextBeat++;
    }

    // Baldosas que se dejaron pasar
    for (const n of this.notes) {
      if (n.hit) continue;
      if (t - n.time > WIN_OK) {
        n.hit = true;
        n.rect.setFillStyle(0xe11d48);
        this.penalize(n.col);
        if (this.over) return;
      } else {
        break;
      }
    }

    // Fin del nivel: pasó la última baldosa
    const last = this.notes[this.notes.length - 1];
    if (last.hit && t > last.time + 0.6) this.endGame(true);
  }

  /* ---- Aciertos y errores ---- */
  handleTap(col) {
    if (this.paused) return;

    if (this.over) {
      if (this.winScreen) return; // en victoria se usan los botones
      if (this.time.now - this.overTime > 500) this.scene.restart({ mode: this.mode });
      return;
    }

    if (this.cfg.rhythm) this.rhythmTap(col);
    else this.classicTap(col);
  }

  classicTap(col) {
    const target = this.rows.find(r => !r.hit);
    if (target.col === col) {
      target.hit = true;
      target.rect.setFillStyle(0xffffff, 0.35);
      this.speed = Math.min(this.speed + this.cfg.accel, this.cfg.maxSpeed);
      this.registerHit(col);
    } else {
      this.penalize(col);
    }
  }

  rhythmTap(col) {
    const target = this.notes.find(n => !n.hit);
    if (!target) return;

    const dt = this.currentSongTime() - target.time; // negativo = temprano
    if (dt < -WIN_OK) {
      this.showJudge('Temprano', '#ffffff');
      return;
    }
    if (target.col !== col) {
      this.penalize(col);
      return;
    }

    target.hit = true;
    target.rect.setFillStyle(0xffffff, 0.35);
    this.registerHit(col, target.freq);

    const a = Math.abs(dt);
    if (a <= WIN_PERFECT) { this.perfects++; this.showJudge('¡PERFECTO!', '#fde047'); }
    else if (a <= WIN_GOOD) this.showJudge('Bien', '#34d399');
    else this.showJudge(dt < 0 ? 'Rápido' : 'Tarde', '#ffffff');
  }

  registerHit(col, freq) {
    this.score++;
    this.hits++;
    this.streak++;
    if (this.streak > this.maxStreak) this.maxStreak = this.streak;
    this.scoreText.setText(this.scoreLabel());
    this.tweens.add({ targets: this.scoreText, scale: { from: 1.3, to: 1 }, duration: 120 });
    this.tweens.add({ targets: this.pulse, alpha: { from: 0.3, to: 0 }, duration: 250 });
    if (freq) playMelodyNote(freq); else playKey(col);

    if (this.streak % 4 === 0) this.showPraise();
    if (!this.cfg.rhythm && this.cfg.goal && this.score >= this.cfg.goal) this.endGame(true);
  }

  penalize(col) {
    this.life -= LIFE_PENALTY;
    this.score = Math.max(0, this.score - SCORE_PENALTY);
    this.streak = 0;
    this.scoreText.setText(this.scoreLabel());
    this.updateLife();
    playError();
    this.cameras.main.shake(120, 0.01);

    const flash = this.add.rectangle(col * COL_W, 0, COL_W, H, 0xe11d48, 0.5)
      .setOrigin(0).setDepth(9);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy()
    });

    if (this.life <= 0) this.endGame(false);
  }

  showJudge(text, color) {
    const txt = this.add.text(W / 2, 410, text, {
      fontSize: '26px', color: color, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({
      targets: txt, y: 380, alpha: 0, duration: 450,
      onComplete: () => txt.destroy()
    });
  }

  showPraise() {
    const list = this.cfg.praise || PRAISE;
    const idx = Math.min(Math.floor(this.streak / 4) - 1, list.length - 1);
    const txt = this.add.text(Phaser.Math.Between(110, 290), 300, list[idx], {
      fontSize: '40px', color: Phaser.Utils.Array.GetRandom(PRAISE_COLORS),
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 6
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({
      targets: txt, y: 200, alpha: 0, scale: 1.4, duration: 900,
      onComplete: () => txt.destroy()
    });
  }

  endGame(win) {
    this.over = true;
    this.overTime = this.time.now;
    this.stopMusic();
    this.newRecord = saveBest(this.mode, this.score);
    win ? playWin() : playLose();

    if (win) { this.showVictory(); return; }

    this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0).setDepth(20);
    this.add.text(W / 2, H / 2,
      'PERDISTE\n\n' +
      'Puntaje: ' + this.score + (this.newRecord ? '  ¡NUEVO RÉCORD!' : '') + '\n' +
      'Mejor: ' + loadBest(this.mode) + '\n' +
      'Tiempo: ' + formatTime(this.clockMs()) + '\n\n' +
      'Toca para reiniciar\nR = reiniciar · M = menú', {
        fontSize: '26px', color: '#ffffff', align: 'center', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(21);
  }

  /* ---- Menú de pausa ---- */
  buildPauseUI() {
    this.pauseUI = [];
    const reg = (o, d) => { o.setDepth(d).setVisible(false); this.pauseUI.push(o); return o; };

    reg(this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0), 20);
    reg(this.add.text(W / 2, 190, 'PAUSA', {
      fontSize: '46px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 6
    }).setOrigin(0.5), 21);

    this.pauseButton(300, 'CONTINUAR  [P]', 0x22c55e, () => this.togglePause(), reg);
    this.pauseButton(370, 'REINICIAR  [R]', 0x2563eb, () => this.scene.restart({ mode: this.mode }), reg);
    this.pauseButton(440, 'SALIR AL MENÚ  [M]', 0xe11d48, () => this.scene.start('Menu'), reg);
  }

  pauseButton(y, label, color, action, reg) {
    const btn = reg(this.add.rectangle(W / 2, y, 270, 52, color)
      .setStrokeStyle(3, 0xffffff, 0.6)
      .setInteractive({ useHandCursor: true }), 21);
    reg(this.add.text(W / 2, y, label, {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5), 22);
    btn.on('pointerover', () => btn.setScale(1.04));
    btn.on('pointerout', () => btn.setScale(1));
    btn.on('pointerdown', () => { if (this.paused) action(); });
  }

  setPauseUI(visible) {
    this.pauseUI.forEach(o => o.setVisible(visible));
  }

  /* ---- Pantalla de victoria ---- */
  showVictory() {
    this.winScreen = true;
    const acc = this.total ? (this.hits / this.total) * 100 : 100;
    const stars = acc >= 95 ? 3 : acc >= 80 ? 2 : 1;
    const cx = W / 2;
    const D = 30;

    this.add.rectangle(0, 0, W, H, 0x050816, 0.85).setOrigin(0).setDepth(D - 10);

    // Panel con borde neón
    const g = this.add.graphics().setDepth(D);
    g.fillStyle(0x0b1020, 0.96);
    g.fillRoundedRect(30, 75, 340, 500, 22);
    g.lineStyle(5, 0xd946ef, 1);
    g.strokeRoundedRect(30, 75, 340, 500, 22);
    g.lineStyle(2, 0x22d3ee, 1);
    g.strokeRoundedRect(37, 82, 326, 486, 17);

    // Banner
    g.fillStyle(0x1e1b4b, 1);
    g.fillRoundedRect(55, 36, 290, 62, 16);
    g.lineStyle(4, 0xfacc15, 1);
    g.strokeRoundedRect(55, 36, 290, 62, 16);
    const banner = this.add.text(cx, 67, '¡VICTORIA!', {
      fontSize: '38px', color: '#fde047', fontStyle: 'bold',
      stroke: '#92400e', strokeThickness: 6
    }).setOrigin(0.5).setDepth(D + 1);
    this.tweens.add({ targets: banner, scale: { from: 0.6, to: 1 }, duration: 400, ease: 'Back.easeOut' });

    // Estrellas
    [130, 200, 270].forEach((sx, i) => {
      const big = i === 1;
      const on = i < stars;
      const star = this.add.star(sx, big ? 148 : 156, 5, big ? 17 : 14, big ? 38 : 31,
        on ? 0xfacc15 : 0x334155)
        .setStrokeStyle(3, on ? 0xfff3a0 : 0x475569)
        .setDepth(D + 1).setScale(0);
      this.tweens.add({
        targets: star, scale: 1, duration: 350, delay: 300 + i * 250, ease: 'Back.easeOut'
      });
      if (on) this.time.delayedCall(300 + i * 250, () => tone(660 + i * 220, 0.25, 'triangle', 0.2));
    });

    // Canción y dificultad
    this.add.text(cx, 215, '"' + this.cfg.songTitle + '"', {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(D + 1);
    this.add.text(cx, 240, this.cfg.songSub, {
      fontSize: '14px', color: '#fb923c'
    }).setOrigin(0.5).setDepth(D + 1);

    // Franja de tejido andino en la Ruta Ecuador
    if (this.cfg.palette) drawTextileBand(this, 45, 558, 310, 12, D + 1);

    // Sello de nuevo récord
    if (this.newRecord) {
      const badge = this.add.container(332, 225).setDepth(D + 3);
      badge.add(this.add.star(0, 0, 10, 27, 33, 0xdc2626).setStrokeStyle(2, 0xfca5a5));
      badge.add(this.add.text(0, 0, 'NUEVO\nRÉCORD', {
        fontSize: '11px', color: '#ffffff', fontStyle: 'bold', align: 'center'
      }).setOrigin(0.5));
      badge.setAngle(14).setScale(0);
      this.tweens.add({ targets: badge, scale: 1, duration: 400, delay: 1100, ease: 'Back.easeOut' });
    }

    // Puntaje con conteo animado
    const scoreTxt = this.add.text(cx, 285, 'PUNTAJE: 0', {
      fontSize: '32px', color: '#67e8f9', fontStyle: 'bold',
      stroke: '#0e4a5c', strokeThickness: 5
    }).setOrigin(0.5).setDepth(D + 1);
    this.tweens.addCounter({
      from: 0, to: this.score, duration: 900, delay: 400,
      onUpdate: (tw) => scoreTxt.setText('PUNTAJE: ' + Math.round(tw.getValue()))
    });

    // Estadísticas
    const row = (y, label, value) => {
      this.add.text(cx + 4, y, label, {
        fontSize: '19px', color: '#e2e8f0', fontStyle: 'bold'
      }).setOrigin(1, 0.5).setDepth(D + 1);
      this.add.text(cx + 12, y, value, {
        fontSize: '19px', color: '#fde047', fontStyle: 'bold'
      }).setOrigin(0, 0.5).setDepth(D + 1);
    };
    row(335, 'PRECISIÓN:', acc.toFixed(1) + '%');
    row(368, 'MAX COMBO:', String(this.maxStreak));
    row(401, 'PERFECTOS:', String(this.perfects));
    row(434, 'TIEMPO:', formatTime(this.clockMs()));
    this.add.text(cx, 463, 'MEJOR: ' + loadBest(this.mode), {
      fontSize: '14px', color: '#94a3b8'
    }).setOrigin(0.5).setDepth(D + 1);

    // Botones (ignoran toques durante los primeros 0.7 s)
    const btn = (x, label, color, action) => {
      const r = this.add.rectangle(x, 505, 150, 52, color)
        .setStrokeStyle(3, 0xffffff, 0.7).setDepth(D + 1)
        .setInteractive({ useHandCursor: true });
      this.add.text(x, 505, label, {
        fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(D + 2);
      r.on('pointerover', () => r.setScale(1.05));
      r.on('pointerout', () => r.setScale(1));
      r.on('pointerdown', () => {
        if (this.time.now - this.overTime < 700) return;
        action();
      });
    };
    btn(125, 'REINTENTAR', 0x2563eb, () => this.scene.restart({ mode: this.mode }));
    btn(275, 'MENÚ', 0xf59e0b, () => this.scene.start('Menu'));

    this.add.text(cx, 548, 'R = reintentar  ·  M = menú', {
      fontSize: '12px', color: '#94a3b8'
    }).setOrigin(0.5).setDepth(D + 1);

    // Confeti
    if (!this.textures.exists('confetti')) {
      const cg = this.make.graphics({ x: 0, y: 0, add: false });
      cg.fillStyle(0xffffff, 1);
      cg.fillRect(0, 0, 8 * SCALE, 12 * SCALE);
      cg.generateTexture('confetti', 8 * SCALE, 12 * SCALE);
      cg.destroy();
    }
    this.add.particles(0, -20, 'confetti', {
      x: { min: 0, max: W },
      lifespan: 3600,
      speedY: { min: 120, max: 260 },
      speedX: { min: -40, max: 40 },
      rotate: { start: 0, end: 360 },
      scale: { min: 0.6 / SCALE, max: 1.2 / SCALE },
      tint: [0xfacc15, 0xf472b6, 0x22d3ee, 0x34d399, 0xffffff],
      frequency: 45,
      quantity: 2
    }).setDepth(D + 15);
  }
}

/* ---------------- CONFIG ---------------- */
const config = {
  type: Phaser.AUTO,
  width: W * SCALE,
  height: H * SCALE,
  parent: 'game',
  backgroundColor: '#0f172a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [MenuScene, GameScene]
};

new Phaser.Game(config);
