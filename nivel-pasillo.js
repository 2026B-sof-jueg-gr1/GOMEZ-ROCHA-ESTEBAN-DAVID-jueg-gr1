/* ==========================================================================
   NIVEL: PASILLO QUITEÑO — "Serenata quiteña"
   Composición original (no copia ni adapta ninguna canción existente).
   Referencia cultural: la figura del chulla quiteño (sombrero, bufanda, bastón,
   serenata nocturna bajo el farol colonial) con la Virgen del Panecillo de fondo.

   Cómo se carga: este archivo va ANTES de game.js en el HTML. Solo define los
   datos del nivel en window.NIVEL_PASILLO; game.js lo registra como modo "pasillo".
   Usa funciones de game.js (pluckAt, bassAt) únicamente cuando el nivel se juega.
   ========================================================================== */
(function () {
  /* ---------------- Música: pasillo en La menor, compás de 3/4 ---------------- */
  const BPM = 88;
  const BEAT = 60 / BPM;      // negra
  const EIGHTH = BEAT / 2;    // corchea
  const BAR = BEAT * 3;       // un compás de 3/4 (6 corcheas)
  const SLOTS = 6;

  // a b c d e f G A  → La4 Si4 Do5 Re5 Mi5 Fa5 Sol#5 La5 (Sol# = sensible de La menor)
  const NOTES = { a: 440.0, b: 493.88, c: 523.25, d: 587.33, e: 659.25, f: 698.46, G: 830.61, A: 880.0 };
  // Graves a la izquierda, agudos a la derecha
  const COL = { a: 0, b: 0, c: 1, d: 1, e: 2, f: 2, G: 3, A: 3 };

  // 16 compases de 6 corcheas. '.' = silencio. Mayúscula = nota aguda (A, G).
  const BARS = [
    'a.c.e.', 'A..e.c', 'f.e.d.', 'e.G.e.',
    'A.e.c.', 'e.d.c.', 'd.f.A.', 'G.e.b.',
    'A.f.d.', 'c.e.A.', 'fedcba', 'b.d.G.',
    'A..e.c', 'f.e.d.', 'e.G.b.', 'a.....'
  ];

  // Acordes: bajo + notas del rasgueo
  const CHORDS = {
    Am: { bass: 110.0, notes: [220.0, 261.63, 329.63] },
    C: { bass: 130.81, notes: [261.63, 329.63, 392.0] },
    Dm: { bass: 146.83, notes: [293.66, 349.23, 440.0] },
    F: { bass: 174.61, notes: [349.23, 440.0, 523.25] },
    E7: { bass: 164.81, notes: [329.63, 415.3, 493.88] }
  };
  const PROG = [
    'Am', 'Am', 'Dm', 'E7',
    'Am', 'C', 'Dm', 'E7',
    'Dm', 'Am', 'F', 'E7',
    'Am', 'Dm', 'E7', 'Am'
  ];

  function buildMap() {
    const times = [], cols = [], freqs = [];
    BARS.forEach((bar, b) => {
      for (let s = 0; s < SLOTS; s++) {
        const ch = bar[s];
        if (ch === '.') continue;
        times.push(+((b * SLOTS + s) * EIGHTH).toFixed(4));
        cols.push(COL[ch]);
        freqs.push(NOTES[ch]);
      }
    });
    return { times, cols, freqs };
  }
  const MAP = buildMap();
  const LENGTH = BARS.length * BAR; // ≈ 33 s

  // Cuerdas suaves (pad) para el aire nostálgico de la serenata
  function stringsAt(ctx, dest, freq, at, dur, vol) {
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.35);
    g.gain.setValueAtTime(vol, at + dur - 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    [-6, 6].forEach(cents => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, at);
      o.detune.value = cents;
      o.connect(lp);
      o.start(at);
      o.stop(at + dur + 0.05);
    });
    lp.connect(g);
    g.connect(dest);
  }

  // Acompañamiento de guitarra: bajo en el 1, acordes en el 2 y el 3
  function schedule(ctx, dest, t0) {
    PROG.forEach((name, b) => {
      const ch = CHORDS[name];
      const bt = t0 + b * BAR;
      const last = b === PROG.length - 1;

      bassAt(ctx, dest, ch.bass, bt, last ? BEAT * 2.5 : BEAT * 0.9, 0.24);

      if (!last) {
        [2, 4].forEach(s => {
          ch.notes.forEach((f, i) => pluckAt(ctx, dest, f, bt + s * EIGHTH + i * 0.02, 0.45, 0.07));
        });
        // contrabajeo en la quinta, en compases alternos
        if (b % 2 === 1) bassAt(ctx, dest, ch.bass * 1.5, bt + 4 * EIGHTH, BEAT * 0.6, 0.1);
      } else {
        ch.notes.forEach((f, i) => pluckAt(ctx, dest, f, bt + 2 * EIGHTH + i * 0.03, 1.6, 0.08));
      }

      // Las cuerdas entran desde la segunda frase
      if (b >= 4) {
        stringsAt(ctx, dest, ch.notes[1], bt, BAR * 1.05, 0.028);
        stringsAt(ctx, dest, ch.notes[2], bt, BAR * 1.05, 0.022);
      }
    });
  }

  /* ---------------- Paisaje: la Virgen del Panecillo de noche ---------------- */
  function drawVirgen(scene, cx, by, s) {
    const g = scene.add.graphics().setDepth(1.65);
    const T = (x1, y1, x2, y2, x3, y3) =>
      g.fillTriangle(cx + x1 * s, by + y1 * s, cx + x2 * s, by + y2 * s, cx + x3 * s, by + y3 * s);

    g.fillStyle(0xcbd5e1, 1); // aluminio bajo la luna
    // Alas
    T(-8, -140, -66, -208, -30, -104);
    T(-8, -128, -48, -176, -22, -92);
    T(8, -140, 66, -208, 30, -104);
    T(8, -128, 48, -176, 22, -92);
    // Túnica
    T(-26, -50, 26, -50, -11, -154);
    T(26, -50, 11, -154, -11, -154);
    // Cabeza
    g.fillCircle(cx, by - 162 * s, 8 * s);
    // Esfera y base
    g.fillStyle(0x94a3b8, 1);
    g.fillCircle(cx, by - 36 * s, 20 * s);
    g.fillRect(cx - 28 * s, by - 16 * s, 56 * s, 16 * s);
    // Corona de 12 estrellas
    g.fillStyle(0xfde68a, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillCircle(cx + Math.cos(a) * 15 * s, by - 162 * s + Math.sin(a) * 15 * s, 1.6 * s);
    }
  }

  // Silueta del chulla quiteño: sombrero, bufanda roja y bastón
  function drawChulla(scene, x, by) {
    const g = scene.add.graphics().setDepth(1.7);
    g.fillStyle(0x05070d, 1);
    g.fillRect(x - 6, by - 22, 5, 22);   // piernas
    g.fillRect(x + 1, by - 22, 5, 22);
    g.fillRect(x - 8, by - 48, 16, 27);  // saco
    g.fillCircle(x, by - 55, 6);         // cabeza
    g.fillRect(x - 11, by - 61, 22, 3);  // ala del sombrero
    g.fillRect(x - 6, by - 71, 12, 11);  // copa
    g.fillRect(x + 10, by - 40, 2, 40);  // bastón
    g.fillStyle(0xb91c1c, 1);
    g.fillRect(x - 7, by - 49, 14, 4);   // bufanda
    g.fillRect(x + 2, by - 49, 4, 16);
  }

  // Farol colonial
  function drawFarol(scene, x, by) {
    scene.add.circle(x, by - 84, 30, 0xfbbf24, 0.22).setDepth(1.7);
    scene.add.circle(x, by - 84, 12, 0xfde68a, 0.55).setDepth(1.7);
    const g = scene.add.graphics().setDepth(1.71);
    g.fillStyle(0x05070d, 1);
    g.fillRect(x - 2, by - 80, 4, 80);
    g.fillRect(x - 8, by - 94, 16, 3);
    g.fillRect(x - 8, by - 76, 16, 3);
    g.fillStyle(0xfef3c7, 0.95);
    g.fillRect(x - 6, by - 91, 12, 15);
  }

  function buildScenery(scene) {
    const P = scene.pas = { stars: [], lights: [] };

    // Estrellas
    for (let i = 0; i < 45; i++) {
      P.stars.push(scene.add.circle(
        Phaser.Math.Between(5, W - 5), Phaser.Math.Between(5, 330),
        Phaser.Math.Between(1, 2), 0xffffff, 0.9
      ).setDepth(1));
    }

    // Luna
    P.moonGlow = scene.add.circle(318, 210, 46, 0xfef3c7, 0.14).setDepth(1.1);
    P.moon = scene.add.circle(318, 210, 24, 0xfef9c3, 0.95).setDepth(1.2);

    // Cordillera del Pichincha
    const m = scene.add.graphics().setDepth(1.5);
    m.fillStyle(0x1b1b3a, 1);
    m.fillTriangle(-60, 600, 60, 430, 190, 600);
    m.fillTriangle(210, 600, 330, 410, 470, 600);
    m.fillTriangle(100, 600, 200, 470, 290, 600);

    // Resplandor detrás de la Virgen (late con cada tiempo)
    P.halo = scene.add.circle(200, 400, 120, 0xfde68a, 0.15).setDepth(1.55);

    // Loma del Panecillo
    const h = scene.add.graphics().setDepth(1.6);
    h.fillStyle(0x0a1020, 1);
    h.fillEllipse(200, 650, 560, 260);

    // Luces de la ciudad
    for (let i = 0; i < 40; i++) {
      P.lights.push(scene.add.circle(
        Phaser.Math.Between(4, W - 4), Phaser.Math.Between(560, 596),
        1.4, 0xfde68a, 0.8
      ).setDepth(1.68));
    }

    drawVirgen(scene, 200, 524, 1.1);
    drawChulla(scene, 24, 596);
    drawFarol(scene, 84, 596);
  }

  function updateScenery(scene, prog) {
    const P = scene.pas;
    if (!P) return;
    const t = scene.elapsed / 1000;

    // La luna sube con la canción
    const my = 215 - 95 * prog;
    P.moon.y = my;
    P.moonGlow.y = my;

    P.stars.forEach((s, i) => s.setAlpha(0.35 + 0.55 * Math.abs(Math.sin(t * 1.6 + i))));
    P.lights.forEach((l, i) => l.setAlpha(0.45 + 0.45 * Math.abs(Math.sin(t * 2.2 + i * 1.7))));

    // El resplandor de la Virgen late con cada negra
    const phase = (((scene.songTime % BEAT) + BEAT) % BEAT) / BEAT;
    P.halo.setAlpha(0.12 + 0.2 * Math.max(0, 1 - phase * 3));
  }

  /* ---------------- Registro del nivel ---------------- */
  window.NIVEL_PASILLO = {
    label: 'PASILLO', rhythm: true, synth: true, map: MAP,
    songTitle: 'SERENATA QUITEÑA', songSub: '(Pasillo · composición original)',
    tileH: 80, fall: 280, hitY: 510, offset: 0, length: LENGTH,
    praise: ['¡Buenazo!', '¡Bacán!', '¡Qué fino!', '¡Chévere!'],
    tileColor: 0x140b24, tileStroke: 0xcbd5e1,
    // Del cielo nocturno al ocaso encendido
    palette: [0x0b1026, 0x1a2a5c, 0x3a1e6b, 0x7c2d5f, 0xb4532a],
    schedule: schedule,
    buildScenery: buildScenery,
    updateScenery: updateScenery
  };
})();
