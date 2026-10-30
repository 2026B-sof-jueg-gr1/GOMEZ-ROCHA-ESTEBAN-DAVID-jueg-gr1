/* ==========================================================================
   NIVEL: EL CHULLA QUITEÑO
   Usa los primeros 30 segundos del audio autorizado incluido en audio/.
   ========================================================================== */
(function () {
  const BEAT = 60 / 96;
  const EIGHTH = BEAT / 2;
  const START = 0.1;
  const DURATION = 30;

  // Patrón de juego en 3/4: cada carácter ocupa una corchea; '.' es silencio.
  const BARS = [
    '0.12.3', '2.0.1.', '3.2.10', '1.0.2.',
    '0.2.1.', '3.1.20', '2.0.3.', '1.2.0.',
    '0.1.3.', '2.0.1.', '3.2.10', '1.0.2.',
    '0.2.1.', '3.1.20', '2.0.3.', '1.2.0.'
  ];

  function buildMap() {
    const times = [];
    const cols = [];

    BARS.forEach((bar, barIndex) => {
      for (let slot = 0; slot < bar.length; slot++) {
        const col = bar[slot];
        if (col === '.') continue;
        times.push(+(START + (barIndex * 6 + slot) * EIGHTH).toFixed(4));
        cols.push(Number(col));
      }
    });

    return { times, cols };
  }

  window.NIVEL_CHULLA = {
    label: 'EL CHULLA QUITEÑO',
    rhythm: true,
    map: buildMap(),
    externalAudio: true,
    musicFile: 'el-chulla-quiteno-grupo-tradicion-karaoke_VByYbZ2d.mp3',
    musicDuration: DURATION,
    songTitle: 'EL CHULLA QUITEÑO',
    songSub: '(Primeros 30 segundos)',
    tileH: 80,
    fall: 280,
    hitY: 510,
    praise: ['¡Chulla!', '¡Quiteño!', '¡Bacán!', '¡De una!'],
    tileColor: 0x24120d,
    tileStroke: 0xf59e0b,
    palette: [0x171329, 0x3b1f3a, 0x713f3f, 0xb4532a, 0xf59e0b]
  };
})();
