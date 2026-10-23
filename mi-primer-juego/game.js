const COLS = 4;
const W = 400, H = 600;
const COL_W = W / COLS;
const TILE_H = 150;
const KEYS = ['D', 'F', 'J', 'K'];

const LIFE_MAX = 300;
const LIFE_PENALTY = 20;
const SCORE_PENALTY = 1;

const PRAISE = ['¡Muy bien!', '¡Genial!', '¡Increíble!', '¡Perfecto!'];
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

const MODES = {
  demo: {
    label: 'DEMO', music: 'recall', rhythm: true,
    tileH: 120, fall: 300, hitY: 510,
    hueSpeed: 4, satStart: 0.35, satGrow: 0.002, satMax: 0.55,
    lightStart: 0.85, lightDrop: 0.0005, lightMin: 0.75
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

/* ---------------- PANTALLA DE INICIO ---------------- */
class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    this.started = false;
    this.add.rectangle(0, 0, W, H, 0x0f172a).setOrigin(0);

    this.add.text(W / 2, 65, 'PIANO\nTILES', {
      fontSize: '52px', color: '#ffffff', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5);

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

    this.makeButton(400, 0x22c55e, 'DEMOSTRACIÓN  [1]',
      'Ritmo · ' + RECALL_MAP.times.length + ' baldosas · Mejor: ' + loadBest('demo'), 'demo');
    this.makeButton(480, 0xe11d48, 'MODO CAÓTICO  [2]',
      'Sin límite · Mejor: ' + loadBest('chaos'), 'chaos');

    this.add.text(W / 2, 575, 'Música: Gabriawll - Recall (NCS)', {
      fontSize: '11px', color: '#64748b'
    }).setOrigin(0.5);

    this.input.keyboard.on('keydown-ONE', () => this.startGame('demo'));
    this.input.keyboard.on('keydown-TWO', () => this.startGame('chaos'));
  }

  makeButton(y, color, title, subtitle, mode) {
    const btn = this.add.rectangle(W / 2, y, 340, 64, color)
      .setInteractive({ useHandCursor: true });
    this.add.text(W / 2, y - 10, title, {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(W / 2, y + 16, subtitle, {
      fontSize: '14px', color: '#ffffff'
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
    this.rows = [];
    this.notes = [];
    this.score = 0;
    this.speed = this.cfg.speed || 250;
    this.elapsed = 0;
    this.songTime = 0;
    this.nextBeat = 0;
    this.musicDone = false;
    this.life = LIFE_MAX;
    this.streak = 0;
    this.over = false;
    this.paused = false;
    this.overTime = 0;
    this.music = null;
    this.newRecord = false;
    this.hits = 0;
    this.maxStreak = 0;
    this.perfects = 0;
    this.winScreen = false;
    this.total = this.cfg.rhythm ? RECALL_MAP.times.length : (this.cfg.goal || 0);

    // Fondo dinámico
    this.bg = this.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0).setDepth(0);

    // Burbujas que suben
    this.bubbles = [];
    for (let i = 0; i < 10; i++) {
      const b = this.add.circle(
        Phaser.Math.Between(0, W), Phaser.Math.Between(0, H),
        Phaser.Math.Between(12, 40), 0xffffff, 0.15
      ).setDepth(1);
      this.bubbles.push({ obj: b, vy: Phaser.Math.Between(20, 60) });
    }

    // Pulso de luz (aciertos / beat)
    this.pulse = this.add.rectangle(0, 0, W, H, 0xffffff, 0).setOrigin(0).setDepth(1);

    // Líneas divisorias
    for (let i = 1; i < COLS; i++) {
      this.add.rectangle(i * COL_W, 0, 2, H, 0xffffff, 0.5).setOrigin(0.5, 0).setDepth(1);
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
      this.handleTap(Math.floor(p.x / COL_W));
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

    // Música
    this.startMusic();
    this.events.once('shutdown', () => this.stopMusic());
  }

  /* ---- Construcción de baldosas ---- */
  buildRhythmTiles() {
    const h = this.cfg.tileH;
    const hitY = this.cfg.hitY;

    // Línea de golpeo
    this.add.rectangle(0, hitY, W, 4, 0xffffff, 0.9).setOrigin(0, 0.5).setDepth(3);

    RECALL_MAP.times.forEach((t, i) => {
      const col = RECALL_MAP.cols[i];
      const rect = this.add.rectangle(col * COL_W, -200, COL_W, h, 0x111111)
        .setOrigin(0, 0.5).setDepth(2);
      this.notes.push({ time: t + AUDIO_OFFSET, col, rect, hit: false });
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

  stopMusic() {
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
    return this.cfg.rhythm ? this.songTime * 1000 : this.elapsed;
  }

  togglePause() {
    if (this.over) return;
    this.paused = !this.paused;
    this.setPauseUI(this.paused);
    if (this.music) this.paused ? this.music.pause() : this.music.resume();
  }

  updateBackground() {
    const c = this.cfg;
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

  /* ---- Modo ritmo (demo) ---- */
  advanceClock(delta) {
    if (this.music && this.music.isPlaying) {
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

    const dt = this.songTime - target.time; // negativo = temprano
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
    this.registerHit(col);

    const a = Math.abs(dt);
    if (a <= WIN_PERFECT) { this.perfects++; this.showJudge('¡PERFECTO!', '#fde047'); }
    else if (a <= WIN_GOOD) this.showJudge('Bien', '#34d399');
    else this.showJudge(dt < 0 ? 'Rápido' : 'Tarde', '#ffffff');
  }

  registerHit(col) {
    this.score++;
    this.hits++;
    this.streak++;
    if (this.streak > this.maxStreak) this.maxStreak = this.streak;
    this.scoreText.setText(this.scoreLabel());
    this.tweens.add({ targets: this.scoreText, scale: { from: 1.3, to: 1 }, duration: 120 });
    this.tweens.add({ targets: this.pulse, alpha: { from: 0.3, to: 0 }, duration: 250 });
    playKey(col);

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
    const idx = Math.min(Math.floor(this.streak / 4) - 1, PRAISE.length - 1);
    const txt = this.add.text(Phaser.Math.Between(110, 290), 300, PRAISE[idx], {
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
    this.add.text(cx, 215, '"RECALL"', {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(D + 1);
    this.add.text(cx, 240, '(Demostración)', {
      fontSize: '14px', color: '#fb923c'
    }).setOrigin(0.5).setDepth(D + 1);

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
      cg.fillRect(0, 0, 8, 12);
      cg.generateTexture('confetti', 8, 12);
      cg.destroy();
    }
    this.add.particles(0, -20, 'confetti', {
      x: { min: 0, max: W },
      lifespan: 3600,
      speedY: { min: 120, max: 260 },
      speedX: { min: -40, max: 40 },
      rotate: { start: 0, end: 360 },
      scale: { min: 0.6, max: 1.2 },
      tint: [0xfacc15, 0xf472b6, 0x22d3ee, 0x34d399, 0xffffff],
      frequency: 45,
      quantity: 2
    }).setDepth(D + 15);
  }
}

/* ---------------- CONFIG ---------------- */
const config = {
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game',
  backgroundColor: '#0f172a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [MenuScene, GameScene]
};

new Phaser.Game(config);
