const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const isMobilePortrait = window.innerWidth < window.innerHeight;
const mobileScale = isMobilePortrait ? 0.6 : 1.0;

const overlay = document.getElementById('startOverlay');
const bgm = document.getElementById('bgm');
const gameOverSound = new Audio('assets/audio/gameover.mp3');
const pointSound = new Audio('assets/audio/point.mp3');
pointSound.preload = 'auto';
const scoreEl = document.getElementById('score');
const pauseButton = document.getElementById('pauseButton');
const pauseImage = document.getElementById('pauseImage');

let score = 0;
let jumpCount = 0;
let gameStarted = false;
let gameOver = false;
let bgmRetry = 0;
let paused = false;
let pauseStartTime = 0;

const BASE_PLAYER_WIDTH = 80;
const PLAYER_WIDTH = BASE_PLAYER_WIDTH * mobileScale;
const FIRST_JUMP_POWER = -17;
const JUMP_POWER = -15;
const MAX_JUMPS = 3;
const BASE_SPEED = 4;
const COLLIDE_THRESHOLD = 0.4;

const GROUND_HEIGHT = 10;
const GROUND_OFFSET = 20;

const player = { x: 50, y: 0, width: 0, height: 0, vy: 0 };
let butas = [], accs = [], tents = [], balloons = [];

const normalGravity = isMobilePortrait ? 0.8 : 0.5;
let GRAVITY = normalGravity;

let gravityTimer = null;
let balloonEffectActive = false;
let balloonEffectEndTime = 0; // ✅ 効果終了予定時刻を管理
let pausedBalloonEffectEndTime = 0; // ポーズ前の効果終了予定時刻

let lastButaTime = 0;
let lastAccTime = 0;
let lastTentTime = 0;
let lastBalloonTime = 0;
const BASE_INTERVAL = 1900;
const BASE_ACC_INTERVAL = 2600;
const BASE_TENT_INTERVAL = 7000;
const BASE_BALLOON_INTERVAL = 6500;

const imageKeys = [
  'momo', 'momomo', 'buta', 'acc', 'tento',
  'gameover', 'gameover2', 'gameover3', 'gameover4', 'gameover5', 'gameover6',
  'huusen'
];
const images = {};
let loadedCount = 0;

imageKeys.forEach(key => {
  images[key] = new Image();
  images[key].src = `assets/images/${key}.png`;
  images[key].onload = () => {
    if (++loadedCount === imageKeys.length) initGame();
  };
});

function playPointSound() {
  const clone = pointSound.cloneNode(true); // ✅ 複製して即時再生
  clone.play().catch(() => {}); // エラーを防ぐ
}

function initGame() {
  player.width = PLAYER_WIDTH;
  player.height = PLAYER_WIDTH * images['momo'].naturalHeight / images['momo'].naturalWidth;
  player.y = canvas.height - GROUND_HEIGHT - GROUND_OFFSET - player.height;

  draw();
  overlay.addEventListener('mousedown', startGame);
  overlay.addEventListener('touchstart', e => { e.preventDefault(); startGame(); }, { passive: false });
  document.addEventListener('keydown', startGame, { once: true });

  // ✅ スタート画面画像を交互に切り替え
  const startImage = document.getElementById('startImage');
  let showFirstImage = true;
  setInterval(() => {
    if (!gameStarted) {
      startImage.src = showFirstImage ? 'assets/images/start2.png' : 'assets/images/start1.png';
      showFirstImage = !showFirstImage;
    }
  }, 500);

  preStartLoop();
}

function preStartLoop() {
  draw();
  if (!gameStarted) requestAnimationFrame(preStartLoop);
}

function startGame() {
  overlay.style.display = 'none';
  if (gameStarted) return;
  gameStarted = true;
  gameOver = false;
  score = 0;
  scoreEl.textContent = '0';
  butas = []; accs = []; tents = []; balloons = []; jumpCount = 0;
  GRAVITY = normalGravity;
  balloonEffectActive = false;
  tryPlayBGM();
  lastButaTime = performance.now();
  lastAccTime = lastTentTime = lastBalloonTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function tryPlayBGM() {
  if (!bgm || bgmRetry > 3) return;
  if (bgm.readyState == 4) {
    bgm.currentTime = 0;
    bgm.play().catch(err => console.warn('BGM 再生失敗:', err));
  } else {
    bgmRetry++;
    setTimeout(tryPlayBGM, 200);  // ロードが未完了なので少し待ってから再試行
  }
}

function getSpawnMultiplier(score) {
  if (score < 100) return 1;
  const extraPoints = score - 100;
  const steps = Math.floor(extraPoints / 20);
  const increase = steps * 0.1;
  return Math.min(1 + increase, 1.6);
}

function getAccInterval(score) {
  if (score >= 15 && score <= 30) {
    return BASE_ACC_INTERVAL / 3; // 300%
  }
  return BASE_ACC_INTERVAL;
}

function spawnButa() {
  const x = canvas.width + Math.random() * 200;
  const safe = PLAYER_WIDTH + 50;
  if ([...butas, ...accs, ...tents, ...balloons].some(o => Math.abs(o.x - x) < safe)) return;

  const wStandard = 60 * mobileScale;
  const hStandard = wStandard * images['buta'].naturalHeight / images['buta'].naturalWidth;

  if (score >= 55 && Math.random() < 0.15) {
    const y = canvas.height - GROUND_HEIGHT - GROUND_OFFSET - hStandard;
    butas.push({ x, y, width: wStandard, height: hStandard, type: 'buta', speed: BASE_SPEED * 0.5 });
    return;
  }

  if (score >= 40 && Math.random() < 0.2) {
    const scale = 1.5;
    const w = wStandard * scale;
    const h = hStandard * scale;
    const isFlying = Math.random() < 0.5;
    let y, speed;

    if (isFlying) {
      const minY = canvas.height * 0.3;
      const maxY = canvas.height * 0.7;
      y = minY + Math.random() * (maxY - minY);
      speed = BASE_SPEED * (1.1 + Math.random() * 0.4);
    } else {
      y = canvas.height - GROUND_HEIGHT - GROUND_OFFSET - h;
      speed = BASE_SPEED;
    }

    butas.push({ x, y, width: w, height: h, type: 'buta', speed });
    return;
  }

  const candidates = [];
  const weights = [];

  candidates.push({ speed: BASE_SPEED, y: canvas.height - GROUND_HEIGHT - GROUND_OFFSET - hStandard });
  weights.push(50);

  if (score >= 20) {
    candidates.push({ speed: BASE_SPEED * 1.7, y: canvas.height - GROUND_HEIGHT - GROUND_OFFSET - hStandard });
    weights.push(20);
  }

  if (score >= 15) {
    candidates.push({ speed: BASE_SPEED * 1.2, y: canvas.height * 0.15 });
    weights.push(30);
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  let selectedIndex = 0;
  for (let i = 0; i < weights.length; i++) {
    if (random < weights[i]) { selectedIndex = i; break; }
    random -= weights[i];
  }

  const selected = candidates[selectedIndex];
  butas.push({ x, y: selected.y, width: wStandard, height: hStandard, type: 'buta', speed: selected.speed });
}

function spawnAcc() {
  const x = canvas.width + Math.random() * 200;
  const safe = PLAYER_WIDTH + 50;
  if ([...butas, ...accs, ...tents, ...balloons].some(o => Math.abs(o.x - x) < safe)) return;

  const w = 60 * mobileScale;
  const h = w * images['acc'].naturalHeight / images['acc'].naturalWidth;
  const groundY = canvas.height - GROUND_HEIGHT - GROUND_OFFSET - h;
  const y = (score >= 10 && Math.random() < 0.5) ? 200 + Math.random() * (groundY - 200) : groundY;

  accs.push({ x, y, width: w, height: h, type: 'acc' });
}

function spawnTent() {
  const x = canvas.width + Math.random() * 400;
  const safe = PLAYER_WIDTH + 50;
  if ([...butas, ...accs, ...tents, ...balloons].some(o => Math.abs(o.x - x) < safe)) return;

  const w = 100 * mobileScale;
  const h = w * images['tento'].naturalHeight / images['tento'].naturalWidth;
  const y = canvas.height - GROUND_HEIGHT - GROUND_OFFSET - h;
  tents.push({ x, y, width: w, height: h, type: 'tento' });
}

function spawnBalloon() {
  if (score < 30) return;
  const x = canvas.width + Math.random() * 400;
  const safe = PLAYER_WIDTH + 50;
  if ([...butas, ...accs, ...tents, ...balloons].some(o => Math.abs(o.x - x) < safe)) return;

  const w = 60 * mobileScale;
  const h = w * images['huusen'].naturalHeight / images['huusen'].naturalWidth;
  const y = canvas.height * 0.9 - h;
  balloons.push({ x, y, width: w, height: h, type: 'huusen' });
}

function update() {
  if (gameOver) return;

  player.vy += GRAVITY;
  player.y += player.vy;
  const groundY = canvas.height - GROUND_HEIGHT - GROUND_OFFSET;
  if (player.y + player.height > groundY) {
    player.y = groundY - player.height;
    player.vy = 0;
    jumpCount = 0;
  }

  butas.forEach(o => o.x -= o.speed);
  accs.forEach(i => i.x -= BASE_SPEED);
  tents.forEach(t => t.x -= BASE_SPEED);
  balloons.forEach(b => b.x -= BASE_SPEED);

  butas.forEach(o => {
    if (!gameOver && isCollision(player, o)) {
      gameOver = true;
      bgm.pause();
      gameOverSound.currentTime = 0;
      gameOverSound.play();
    }
  });

  const blinkEffect = () => {
    scoreEl.classList.add('blink');
    setTimeout(() => scoreEl.classList.remove('blink'), 500);
  };

  for (let i = accs.length - 1; i >= 0; i--) {
    if (isCollision(player, accs[i])) {
      player.width *= 1.2;
      player.height *= 1.2;
      playPointSound();
      score++;
      scoreEl.textContent = score;
      blinkEffect();
      accs.splice(i, 1);
    }
  }

  for (let i = tents.length - 1; i >= 0; i--) {
    if (isCollision(player, tents[i])) {
      player.width = PLAYER_WIDTH;
      player.height = PLAYER_WIDTH * images['momo'].naturalHeight / images['momo'].naturalWidth;
      playPointSound();
      score++;
      scoreEl.textContent = score;
      blinkEffect();
      tents.splice(i, 1);
    }
  }

  for (let i = balloons.length - 1; i >= 0; i--) {
    if (isCollision(player, balloons[i])) {
      playPointSound();
      score++;
      scoreEl.textContent = score;
      blinkEffect();
      balloons.splice(i, 1);

      GRAVITY = isMobilePortrait ? 0.4 : 0.25;
      balloonEffectActive = true;
      balloonEffectEndTime = performance.now() + 5000; // ✅ 効果終了予定時刻を記録
    }

    if (balloonEffectActive && performance.now() > balloonEffectEndTime) {
      GRAVITY = normalGravity;
      balloonEffectActive = false;
    }
  }

  butas = butas.filter(o => o.x + o.width > 0);
  accs = accs.filter(i => i.x + i.width > 0);
  tents = tents.filter(t => t.x + t.width > 0);
  balloons = balloons.filter(b => b.x + b.width > 0);
}

function draw() {
  ctx.fillStyle = '#87CEFA';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#222';
  ctx.fillRect(0, canvas.height - GROUND_HEIGHT - GROUND_OFFSET, canvas.width, GROUND_HEIGHT);

  butas.forEach(o => ctx.drawImage(images[o.type], o.x, o.y, o.width, o.height));
  accs.forEach(i => ctx.drawImage(images[i.type], i.x, i.y, i.width, i.height));
  tents.forEach(t => ctx.drawImage(images[t.type], t.x, t.y, t.width, t.height));
  balloons.forEach(b => ctx.drawImage(images[b.type], b.x, b.y, b.width, b.height));

  let key;
  if (player.vy === 0 && jumpCount === 0) {
    key = (Math.floor(performance.now() / 200) % 2 === 0) ? 'momo' : 'momomo';
  } else {
    key = 'momo';
  }
  ctx.drawImage(images[key], player.x, player.y, player.width, player.height);

  // ✅ 残り1秒で風船を点滅
  if (balloonEffectActive) {
    const balloonHeight = 60;
    const aspect = images['huusen'].naturalWidth / images['huusen'].naturalHeight;
    const balloonWidth = balloonHeight * aspect;
    const bx = player.x + (player.width / 2) - (balloonWidth / 2);
    const by = player.y - balloonHeight - 10;

    const remaining = balloonEffectEndTime - performance.now();
    if (remaining < 1000) {
      if (Math.floor(remaining / 250) % 2 === 0) {
        ctx.drawImage(images['huusen'], bx, by, balloonWidth, balloonHeight);
      }
    } else {
      ctx.drawImage(images['huusen'], bx, by, balloonWidth, balloonHeight);
    }
  }

  if (paused) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('一時停止中', canvas.width / 2, canvas.height / 2);
  }

  if (gameOver) {
    let img;
    if (score < 20) img = images['gameover'];
    else if (score < 50) img = images['gameover2'];
    else if (score < 80) img = images['gameover3'];
    else if (score < 150) img = images['gameover4'];
    else if (score < 300) img = images['gameover5'];
    else img = images['gameover6'];

    const aspect = img.naturalWidth / img.naturalHeight;
    let targetHeight = canvas.height * 0.5;
    let targetWidth = targetHeight * aspect;
    if (targetWidth > canvas.width * 0.9) {
      targetWidth = canvas.width * 0.9;
      targetHeight = targetWidth / aspect;
    }

    const X = (canvas.width - targetWidth) / 2;
    const Y = (canvas.height - targetHeight) / 2;
    ctx.drawImage(img, X, Y, targetWidth, targetHeight);
  }
}

function gameLoop(timestamp) {
  if (paused) {
    draw();
    requestAnimationFrame(gameLoop);
    return;
  }

  update();
  draw();

  const elapsedObs = timestamp - lastButaTime;
  const currentIntervalObs = BASE_INTERVAL / getSpawnMultiplier(score);
  if (elapsedObs >= currentIntervalObs) {
    spawnButa();
    lastButaTime = timestamp;
  }

  const elapsedAcc = timestamp - lastAccTime;
  const currentAccInterval = getAccInterval(score);
  if (elapsedAcc >= currentAccInterval) {
    spawnAcc();
    console.debug('acc spawn');
    lastAccTime = timestamp;
  }

  const elapsedTent = timestamp - lastTentTime;
  if (elapsedTent >= BASE_TENT_INTERVAL) {
    spawnTent();
    console.debug('tent spawn');
    lastTentTime = timestamp;
  }

  const elapsedBalloon = timestamp - lastBalloonTime;
  if (elapsedBalloon >= BASE_BALLOON_INTERVAL) {
    spawnBalloon();
    console.debug('balloon spawn');
    lastBalloonTime = timestamp;
  }

  if (!gameOver) requestAnimationFrame(gameLoop);
}

function isCollision(a, b) {
  const xO = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yO = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const area = xO * yO;
  const minA = Math.min(a.width * a.height, b.width * b.height);
  return area >= minA * COLLIDE_THRESHOLD;
}

function doJump() {
  if (jumpCount < MAX_JUMPS) {
    player.vy = (jumpCount === 0 ? FIRST_JUMP_POWER : JUMP_POWER);
    jumpCount++;
  }
}

function togglePause() {
  const now = performance.now();
  paused = !paused;

  if (paused) { 
    pauseStartTime = now;
    if (balloonEffectActive) {
      // 風船の有効時間を無限にする
      pausedBalloonEffectEndTime = balloonEffectEndTime;
      balloonEffectEndTime = Number.MAX_SAFE_INTEGER;
    }
    pauseImage.src = "./assets/images/resume.png"
  } else {
    const pauseDuration = now - pauseStartTime;
    lastAccTime += pauseDuration;
    lastTentTime += pauseDuration;
    lastBalloonTime += pauseDuration;
    lastButaTime += pauseDuration;
    if (balloonEffectActive) balloonEffectEndTime = pausedBalloonEffectEndTime + pauseDuration;
    pauseImage.src = "./assets/images/pause.png"
  }
}

window.addEventListener('keydown', e => {
  if (gameOver) {
    location.reload();
  } else if (e.code === 'Space' || e.code === 'ArrowUp') {
    doJump();
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    togglePause()
  }
});
canvas.addEventListener('mousedown', () => { gameOver ? location.reload() : doJump(); });
canvas.addEventListener('touchstart', e => { e.preventDefault(); gameOver ? location.reload() : doJump(); }, { passive: false });
pauseButton.addEventListener('mousedown', () => { if (!gameOver) togglePause() });
pauseButton.addEventListener('touchStart', e => { e.preventDefault(); if (!gameOver) togglePause() }, { passive: false });