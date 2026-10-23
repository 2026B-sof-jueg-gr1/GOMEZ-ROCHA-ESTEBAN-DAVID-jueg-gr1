const COLS = 4;
const W = 400, H = 600;
const COL_W = W / COLS;
const TILE_H = 150;
const KEYS = ['D', 'F', 'J', 'K'];

const config = {
  type: Phaser.AUTO,
  width: W,
  height: H,
  backgroundColor: '#ffffff',
  scene: { create: create, update: update }
};
new Phaser.Game(config);

let sc, rows, score, speed, gameOver, overTime, scoreText;

function create() {
  sc = this;
  rows = [];
  score = 0;
  speed = 250;
  gameOver = false;

  // Líneas divisorias
  for (let i = 1; i < COLS; i++) {
    this.add.rectangle(i * COL_W, 0, 2, H, 0xcccccc).setOrigin(0.5, 0);
  }

  // Filas iniciales (tops: 300, 150, 0, -150, -300)
  for (let i = 0; i < 5; i++) addRow(H - TILE_H * (i + 2));

  scoreText = this.add.text(W / 2, 15, '0', {
    fontSize: '48px', color: '#e11d48', fontStyle: 'bold'
  }).setOrigin(0.5, 0).setDepth(10);

  // Entrada: clic/tap y teclado
  this.input.on('pointerdown', (p) => handleTap(Math.floor(p.x / COL_W)));
  this.input.keyboard.on('keydown', (e) => {
    const i = KEYS.indexOf(e.key.toUpperCase());
    if (i >= 0) handleTap(i);
  });
}

function addRow(top) {
  const col = Phaser.Math.Between(0, COLS - 1);
  const rect = sc.add.rectangle(col * COL_W, top, COL_W, TILE_H, 0x111111).setOrigin(0, 0);
  rows.push({ rect, col, hit: false });
}

function update(time, delta) {
  if (gameOver) return;

  const dy = speed * delta / 1000;
  rows.forEach(r => r.rect.y += dy);

  // Generar fila nueva arriba
  const top = rows[rows.length - 1];
  if (top.rect.y > -TILE_H) addRow(top.rect.y - TILE_H);

  // Fila que salió por abajo
  if (rows[0].rect.y > H) {
    if (!rows[0].hit) {
      rows[0].rect.setFillStyle(0xe11d48);
      endGame();
    } else {
      rows[0].rect.destroy();
      rows.shift();
    }
  }
}

function handleTap(col) {
  if (gameOver) {
    // Reiniciar (con pequeña pausa para no reiniciar por accidente)
    if (sc.time.now - overTime > 500) sc.scene.restart();
    return;
  }
  const target = rows.find(r => !r.hit);
  if (target.col === col) {
    target.hit = true;
    target.rect.setFillStyle(0xbbbbbb);
    score++;
    speed += 8;
    scoreText.setText(score);
  } else {
    target.rect.setFillStyle(0xe11d48);
    endGame();
  }
}

function endGame() {
  gameOver = true;
  overTime = sc.time.now;
  sc.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setDepth(20);
  sc.add.text(W / 2, H / 2, 'GAME OVER\nPuntaje: ' + score + '\n\nToca para reiniciar', {
    fontSize: '28px', color: '#ffffff', align: 'center'
  }).setOrigin(0.5).setDepth(21);
}