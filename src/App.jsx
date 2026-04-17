import React, { useState, useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';
import './index.css';

// ==========================================
// --- ゲーム設定定数（★ここでバランス調整が可能です） ---
// ==========================================
const BALL_SPEED = 5; // ボールの基本速度
const PADDLE_THICKNESS = 30; // バーの太さ
const RESPAWN_TIME = 15000; // ブロックが復活するまでの時間（ミリ秒）
const AUTO_START_DELAY = 3000; // バーを繋いでからスタートするまでの待機時間（ミリ秒）

// --- アイテム出現確率設定 ---
const ITEM_DROP_RATE = 0.1; // ブロックを壊した時にアイテムが落ちる全体確率 (0.2 = 20%)
const PROB_LIFE = 0.1; // その中で LIFE が選ばれる確率 (0.10 = 10%)
const PROB_GUARD = 0.45; // その中で GUARD が選ばれる確率 (0.45 = 45%)
const PROB_LONG = 0.45; // その中で LONG が選ばれる確率 (0.45 = 45%)
// ※ 合計 1.0 (100%) になるようにしてください。
// ==========================================

const dist2 = (v, w) => (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
const distToSegmentSquared = (p, v, w) => {
  const l2 = dist2(v, w);
  if (l2 === 0) return dist2(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
};

export default function App() {
  const [currentMode, setCurrentMode] = useState('setup');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [thresholdDistance, setThresholdDistance] = useState(400);
  const [statusMsg, setStatusMsg] = useState('');

  const [isAIReadyState, setIsAIReadyState] = useState(false);
  const [canStart, setCanStart] = useState(false);

  const [highScore, setHighScore] = useState(() =>
    parseInt(localStorage.getItem('breakout_highscore') || '0', 10),
  );

  const videoRef = useRef(null);
  const setupCanvasRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const gameCanvasRef = useRef(null);
  const distanceTextRef = useRef(null);

  const isAIReadyRef = useRef(false);
  const canStartRef = useRef(false);
  const autoStartStartTimeRef = useRef(null);

  const engineRef = useRef(null);
  const renderLoopIdRef = useRef(null);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);

  const gameData = useRef({
    playerA: { x: 0, y: 0 },
    playerB: { x: 0, y: 0 },
    isHoldingBall: true,
    launchTime: 0,
    lives: 3,
    score: 0,
    blocks: [],
    ball: null,
    physicsPaddle: null,
    respawnQueue: [],
    gameState: 'playing',
    isNewRecord: false,
    items: [],
    isGuardMode: false,
    guardTimer: 0,
    guardPaddle: null,
    guardVx: 6,
    isLongBar: false,
    longBarTimer: 0,
    lastPaddleY: 0,
    paddleVy: 0,
  });

  const resizeCanvases = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (setupCanvasRef.current) {
      setupCanvasRef.current.width = w;
      setupCanvasRef.current.height = h;
    }
    if (gameCanvasRef.current) {
      gameCanvasRef.current.width = w;
      gameCanvasRef.current.height = h;
    }
    if (bgCanvasRef.current) {
      bgCanvasRef.current.width = w;
      bgCanvasRef.current.height = h;
    }
    if (currentMode === 'game') resetPhysicsWalls(w, h);
  }, [currentMode]);

  useEffect(() => {
    window.addEventListener('resize', resizeCanvases);
    const timer = setTimeout(resizeCanvases, 50);
    return () => {
      window.removeEventListener('resize', resizeCanvases);
      clearTimeout(timer);
    };
  }, [resizeCanvases, currentMode]);

  useEffect(() => {
    const hands = new window.Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    hands.onResults((results) => {
      if (!isCameraOn) return;
      if (!isAIReadyRef.current) {
        isAIReadyRef.current = true;
        setIsAIReadyState(true);
        setStatusMsg('');
      }

      const cw = window.innerWidth;
      const ch = window.innerHeight;
      let drawX = 0,
        drawY = 0,
        drawW = cw,
        drawH = ch;

      if (results.image) {
        const imgW = results.image.width || 1280;
        const imgH = results.image.height || 720;
        const scale = Math.max(cw / imgW, ch / imgH);
        drawW = imgW * scale;
        drawH = imgH * scale;
        drawX = (cw - drawW) / 2;
        drawY = (ch - drawH) / 2;
      }

      let pA = { x: 0, y: 0 },
        pB = { x: 0, y: 0 };
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handPositions = results.multiHandLandmarks
          .map((landmarks) => {
            let palm = landmarks[9];
            return {
              x: drawX + (1 - palm.x) * drawW,
              y: drawY + palm.y * drawH,
            };
          })
          .sort((a, b) => a.x - b.x);

        if (handPositions.length >= 2) {
          pA = handPositions[0];
          pB = handPositions[1];
        } else if (handPositions.length === 1) {
          if (handPositions[0].x < cw / 2) pA = handPositions[0];
          else pB = handPositions[0];
        }
      }

      if (currentMode === 'setup') {
        renderSetupView(results, pA, pB, drawX, drawY, drawW, drawH);
      } else if (currentMode === 'game') {
        renderGameBackground(results, drawX, drawY, drawW, drawH);
        gameData.current.playerA = pA;
        gameData.current.playerB = pB;
      }
    });
    handsRef.current = hands;
    return () => {
      if (handsRef.current) handsRef.current.close();
    };
  }, [isCameraOn, currentMode, thresholdDistance]);

  useEffect(() => {
    if (isCameraOn) {
      setStatusMsg('カメラ・AIを起動中...');
      navigator.mediaDevices
        .getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            cameraRef.current = new window.Camera(videoRef.current, {
              onFrame: async () => {
                await handsRef.current.send({ image: videoRef.current });
              },
              width: 1280,
              height: 720,
            });
            cameraRef.current.start();
          }
        })
        .catch((err) => {
          alert('起動失敗: ' + err.message);
          setIsCameraOn(false);
          setStatusMsg('');
        });
    } else {
      isAIReadyRef.current = false;
      setIsAIReadyState(false);
      canStartRef.current = false;
      setCanStart(false);
      setStatusMsg('');
      if (cameraRef.current) cameraRef.current.stop();
      if (videoRef.current && videoRef.current.srcObject)
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
    }
  }, [isCameraOn]);

  const renderSetupView = (results, pA, pB, drawX, drawY, drawW, drawH) => {
    const canvas = setupCanvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width,
      ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    if (results.image) {
      ctx.save();
      ctx.translate(cw, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, drawX, drawY, drawW, drawH);
      ctx.restore();

      if (results.multiHandLandmarks) {
        ctx.fillStyle = '#ff007f';
        results.multiHandLandmarks.forEach((landmarks) => {
          let nx = drawX + (1 - landmarks[9].x) * drawW;
          let ny = drawY + landmarks[9].y * drawH;
          ctx.beginPath();
          ctx.arc(nx, ny, 10, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    const distance =
      pA.x !== 0 && pB.x !== 0 ? Math.hypot(pB.x - pA.x, pB.y - pA.y) : 0;
    if (distanceTextRef.current)
      distanceTextRef.current.textContent = `距離: ${Math.floor(distance)}px`;

    drawHandMarker(ctx, pA.x, pA.y, 'A');
    drawHandMarker(ctx, pB.x, pB.y, 'B');

    const isConnected =
      distance < thresholdDistance && pA.x !== 0 && pB.x !== 0;
    const ratio = Math.min(distance / thresholdDistance, 1);
    const r = Math.floor(255 * ratio),
      g = Math.floor(255 * (1 - ratio));

    ctx.lineCap = 'round';
    if (isConnected) {
      ctx.lineWidth = 15;
      ctx.strokeStyle = `rgb(${r}, ${g}, 200)`;
      ctx.shadowBlur = 15;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.setLineDash([]);
      if (distanceTextRef.current)
        distanceTextRef.current.style.color = '#00ffcc';
    } else {
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)';
      ctx.shadowBlur = 0;
      ctx.setLineDash([10, 20]);
      if (distanceTextRef.current)
        distanceTextRef.current.style.color = '#ff3333';
    }

    if (pA.x !== 0 && pB.x !== 0) {
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    if (isAIReadyRef.current) {
      if (isConnected) {
        if (!autoStartStartTimeRef.current) {
          autoStartStartTimeRef.current = Date.now();
        }
        const elapsed = Date.now() - autoStartStartTimeRef.current;
        const remaining = Math.ceil((AUTO_START_DELAY - elapsed) / 1000);

        if (remaining > 0) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(cw / 2 - 100, ch / 2 - 60, 200, 120);
          ctx.fillStyle = '#00ffcc';
          ctx.font = 'bold 60px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(remaining, cw / 2, ch / 2 + 20);
          ctx.font = '20px sans-serif';
          ctx.fillText('READY...', cw / 2, ch / 2 - 30);
        }
        if (elapsed >= AUTO_START_DELAY) {
          autoStartStartTimeRef.current = null;
          handleStartGame();
          return;
        }
        if (!canStartRef.current) {
          canStartRef.current = true;
          setCanStart(true);
        }
      } else {
        autoStartStartTimeRef.current = null;
        if (canStartRef.current) {
          canStartRef.current = false;
          setCanStart(false);
        }
      }
    }
  };

  const drawHandMarker = (ctx, x, y, label) => {
    if (x === 0 && y === 0) return;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '12px bold sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 4);
  };

  const startGame = () => {
    engineRef.current = Matter.Engine.create();
    engineRef.current.gravity.y = 0;

    autoStartStartTimeRef.current = null;

    gameData.current = {
      ...gameData.current,
      isHoldingBall: true,
      launchTime: 0,
      lives: 3,
      score: 0,
      isNewRecord: false,
      respawnQueue: [],
      gameState: 'playing',
      blocks: [],
      ball: null,
      physicsPaddle: null,
      walls: [],
      items: [],
      isGuardMode: false,
      guardTimer: 0,
      guardPaddle: null,
      guardVx: 6,
      isLongBar: false,
      longBarTimer: 0,
      lastPaddleY: 0,
      paddleVy: 0,
    };
    resizeCanvases();
    createBlocks();

    Matter.Events.on(engineRef.current, 'collisionStart', (e) => {
      if (gameData.current.gameState !== 'playing') return;
      e.pairs.forEach((pair) => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        if (bodyA.label === 'block') bodyA.isHit = true;
        if (bodyB.label === 'block') bodyB.isHit = true;

        const ball =
          bodyA.label === 'ball'
            ? bodyA
            : bodyB.label === 'ball'
              ? bodyB
              : null;
        const paddle =
          bodyA.label === 'paddle'
            ? bodyA
            : bodyB.label === 'paddle'
              ? bodyB
              : null;

        if (ball && paddle && !gameData.current.isHoldingBall) {
          if (ball.velocity.y > 0) {
            let newVy = -ball.velocity.y;
            if (gameData.current.paddleVy < -1) {
              newVy += gameData.current.paddleVy * 0.5;
            }
            let hitOffset = ball.position.x - paddle.position.x;
            let newVx = ball.velocity.x + hitOffset * 0.05;
            Matter.Body.setVelocity(ball, { x: newVx, y: newVy });
          }
        }
      });
    });

    gameLoop();
  };

  const stopGame = () => {
    if (renderLoopIdRef.current) cancelAnimationFrame(renderLoopIdRef.current);
    if (engineRef.current) {
      Matter.World.clear(engineRef.current.world);
      Matter.Engine.clear(engineRef.current);
    }
    gameData.current.blocks = [];
    gameData.current.ball = null;
    autoStartStartTimeRef.current = null;
  };

  const resetPhysicsWalls = (w, h) => {
    if (!engineRef.current) return;
    gameData.current.walls.forEach((wall) =>
      Matter.Composite.remove(engineRef.current.world, wall),
    );
    gameData.current.walls = [
      Matter.Bodies.rectangle(-25, h / 2, 50, h, {
        isStatic: true,
        restitution: 1,
        friction: 0,
      }),
      Matter.Bodies.rectangle(w + 25, h / 2, 50, h, {
        isStatic: true,
        restitution: 1,
        friction: 0,
      }),
      Matter.Bodies.rectangle(w / 2, -25, w, 50, {
        isStatic: true,
        restitution: 1,
        friction: 0,
      }),
    ];
    Matter.World.add(engineRef.current.world, gameData.current.walls);
  };

  const createBlocks = () => {
    const cw = window.innerWidth,
      ch = window.innerHeight;
    const rows = 5,
      cols = 10,
      padding = 10;
    const w = (cw - padding * (cols + 1)) / cols,
      h = 40;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let x = padding + c * (w + padding) + w / 2;
        // ブロックを少し下に配置し、天井にめり込む隙間をなくす
        let y = 60 + r * (h + padding) + h / 2;

        let block = Matter.Bodies.rectangle(x, y, w, h, {
          isStatic: true,
          label: 'block',
          renderColor: `hsl(${(r * 40 + c * 20) % 360}, 80%, 50%)`,
          customW: w,
          customH: h,
          friction: 0,
          restitution: 1,
        });
        gameData.current.blocks.push(block);
      }
    }
    Matter.World.add(engineRef.current.world, gameData.current.blocks);
  };

  const createBall = (x, y) => {
    gameData.current.ball = Matter.Bodies.circle(x, y, 20, {
      restitution: 1.05,
      friction: 0,
      frictionAir: 0,
      inertia: Infinity,
      label: 'ball',
    });
    Matter.World.add(engineRef.current.world, gameData.current.ball);
  };

  const handleBlockHit = (blockBody) => {
    if (!gameData.current.blocks.includes(blockBody)) return;
    gameData.current.score += 100;
    Matter.Composite.remove(engineRef.current.world, blockBody);
    gameData.current.blocks = gameData.current.blocks.filter(
      (b) => b !== blockBody,
    );

    if (Math.random() < ITEM_DROP_RATE) {
      const rand = Math.random();
      let type = 'GUARD';
      if (rand < PROB_LIFE) {
        type = 'LIFE';
      } else if (rand < PROB_LIFE + PROB_GUARD) {
        type = 'GUARD';
      } else {
        type = 'LONG';
      }

      gameData.current.items.push({
        x: blockBody.position.x,
        y: blockBody.position.y,
        type: type,
        speed: 1,
      });
    }

    gameData.current.respawnQueue.push({
      x: blockBody.position.x,
      y: blockBody.position.y,
      w: blockBody.customW,
      h: blockBody.customH,
      color: blockBody.renderColor,
      respawnAt: Date.now() + RESPAWN_TIME,
    });
  };

  const renderGameBackground = (results, drawX, drawY, drawW, drawH) => {
    const canvas = bgCanvasRef.current;
    if (!canvas || canvas.width === 0 || !results.image) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width,
      ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, drawX, drawY, drawW, drawH);
    ctx.restore();
  };

  const gameLoop = () => {
    renderLoopIdRef.current = requestAnimationFrame(gameLoop);
    const state = gameData.current;
    const engine = engineRef.current;
    const ctx = gameCanvasRef.current?.getContext('2d');
    if (!ctx || !engine) return;
    const cw = window.innerWidth,
      ch = window.innerHeight;
    const now = Date.now();

    if (state.isGuardMode && now > state.guardTimer) {
      state.isGuardMode = false;
    }
    if (state.isLongBar && now > state.longBarTimer) state.isLongBar = false;

    const activeBallSpeed = BALL_SPEED;
    const activeThreshold = state.isLongBar
      ? thresholdDistance * 1.5
      : thresholdDistance;

    if (state.physicsPaddle) {
      Matter.Composite.remove(engine.world, state.physicsPaddle);
      state.physicsPaddle = null;
    }

    if (state.gameState === 'playing') {
      if (state.isGuardMode) {
        const guardWidth = cw * 0.4;
        if (!state.guardPaddle) {
          state.guardPaddle = Matter.Bodies.rectangle(
            cw / 2,
            ch - 20,
            guardWidth,
            20,
            {
              isStatic: true,
              restitution: 1.1,
              friction: 0,
              label: 'guard',
            },
          );
          Matter.World.add(engine.world, state.guardPaddle);
          state.guardVx = 6;
        } else {
          let gx = state.guardPaddle.position.x + state.guardVx;
          if (gx - guardWidth / 2 < 0) {
            gx = guardWidth / 2;
            state.guardVx *= -1;
          }
          if (gx + guardWidth / 2 > cw) {
            gx = cw - guardWidth / 2;
            state.guardVx *= -1;
          }
          Matter.Body.setPosition(state.guardPaddle, { x: gx, y: ch - 20 });
        }
      } else if (state.guardPaddle) {
        Matter.Composite.remove(engine.world, state.guardPaddle);
        state.guardPaddle = null;
      }
    }

    if (
      state.playerA.x !== 0 &&
      state.playerB.x !== 0 &&
      state.gameState === 'playing'
    ) {
      let distance = Math.hypot(
        state.playerB.x - state.playerA.x,
        state.playerB.y - state.playerA.y,
      );
      let cx = (state.playerA.x + state.playerB.x) / 2,
        cy = (state.playerA.y + state.playerB.y) / 2;

      if (state.lastPaddleY !== 0) {
        state.paddleVy = cy - state.lastPaddleY;
      }
      state.lastPaddleY = cy;

      if (distance < activeThreshold) {
        let angle = Math.atan2(
          state.playerB.y - state.playerA.y,
          state.playerB.x - state.playerA.x,
        );
        state.physicsPaddle = Matter.Bodies.rectangle(
          cx,
          cy,
          distance,
          PADDLE_THICKNESS,
          {
            isStatic: true,
            angle: angle,
            chamfer: { radius: 10 },
            restitution: 1.1,
            friction: 0,
            label: 'paddle',
          },
        );
        Matter.World.add(engine.world, state.physicsPaddle);

        if (!state.ball) {
          createBall(cx, cy - PADDLE_THICKNESS - 10);
          state.isHoldingBall = true;
          state.launchTime = now + 3000;
        }
      }

      if (state.ball && state.isHoldingBall) {
        if (distance < activeThreshold) {
          Matter.Body.setPosition(state.ball, {
            x: cx,
            y: cy - PADDLE_THICKNESS - 10,
          });
        }
        Matter.Body.setVelocity(state.ball, { x: 0, y: 0 });

        if (now >= state.launchTime) {
          state.isHoldingBall = false;
          let xDir = Math.random() > 0.5 ? 1 : -1;
          let xSpeed = activeBallSpeed * (0.2 + Math.random() * 0.2);
          Matter.Body.setVelocity(state.ball, {
            x: xSpeed * xDir,
            y: -activeBallSpeed,
          });
        }
      }
    }

    if (state.gameState === 'playing') {
      for (let i = state.respawnQueue.length - 1; i >= 0; i--) {
        if (now >= state.respawnQueue[i].respawnAt) {
          let info = state.respawnQueue[i];
          let newBlock = Matter.Bodies.rectangle(
            info.x,
            info.y,
            info.w,
            info.h,
            {
              isStatic: true,
              label: 'block',
              renderColor: info.color,
              customW: info.w,
              customH: info.h,
              friction: 0,
              restitution: 1,
            },
          );
          state.blocks.push(newBlock);
          Matter.World.add(engine.world, newBlock);
          state.respawnQueue.splice(i, 1);
        }
      }

      Matter.Engine.update(engine);

      for (let i = state.blocks.length - 1; i >= 0; i--) {
        if (state.blocks[i].isHit) {
          handleBlockHit(state.blocks[i]);
        }
      }
    }

    ctx.clearRect(0, 0, cw, ch);

    state.blocks.forEach((b) => {
      ctx.fillStyle = b.renderColor;
      ctx.beginPath();
      ctx.rect(
        b.position.x - b.bounds.max.x + b.bounds.min.x / 2,
        b.position.y - 20,
        b.bounds.max.x - b.bounds.min.x,
        40,
      );
      ctx.fillRect(
        b.vertices[0].x,
        b.vertices[0].y,
        b.vertices[2].x - b.vertices[0].x,
        b.vertices[2].y - b.vertices[0].y,
      );
    });

    if (state.gameState === 'playing') {
      for (let i = state.items.length - 1; i >= 0; i--) {
        let item = state.items[i];
        item.y += item.speed;

        ctx.fillStyle =
          item.type === 'LIFE'
            ? '#ff3366'
            : item.type === 'GUARD'
              ? '#33ccff'
              : '#ccff33';
        ctx.beginPath();
        ctx.arc(item.x, item.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        let icon =
          item.type === 'LIFE' ? '💖' : item.type === 'GUARD' ? '🛡️' : '↔️';
        ctx.fillText(icon, item.x, item.y + 5);

        let isHit = false;
        if (state.playerA.x !== 0 && state.playerB.x !== 0) {
          const d2 = distToSegmentSquared(
            { x: item.x, y: item.y },
            state.playerA,
            state.playerB,
          );
          if (d2 <= Math.pow(18 + PADDLE_THICKNESS / 2, 2)) isHit = true;
        }

        if (isHit) {
          if (item.type === 'LIFE') state.lives++;
          else if (item.type === 'GUARD') {
            state.isGuardMode = true;
            state.guardTimer = now + 10000;
          } else if (item.type === 'LONG') {
            state.isLongBar = true;
            state.longBarTimer = now + 10000;
          }
          state.items.splice(i, 1);
          continue;
        }

        if (item.y > ch + 30) state.items.splice(i, 1);
      }
    }

    if (state.ball && state.gameState === 'playing') {
      if (state.isGuardMode && state.guardPaddle) {
        const gw = cw * 0.4;
        ctx.fillStyle = 'rgba(0, 255, 204, 0.8)';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffcc';
        ctx.fillRect(
          state.guardPaddle.position.x - gw / 2,
          state.guardPaddle.position.y - 10,
          gw,
          20,
        );
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(state.ball.position.x, state.ball.position.y, 20, 0, 2 * Math.PI);
      ctx.fill();

      if (state.ball.position.y > ch + 50) {
        state.lives--;
        if (state.lives <= 0) {
          state.gameState = 'gameover';
          if (state.score > highScore) {
            setHighScore(state.score);
            localStorage.setItem('breakout_highscore', state.score.toString());
            state.isNewRecord = true;
          }
          Matter.Composite.remove(engine.world, state.ball);
          state.ball = null;
        } else {
          Matter.Composite.remove(engine.world, state.ball);
          state.ball = null;
          state.isHoldingBall = true;
        }
      }

      if (state.ball && !state.isHoldingBall) {
        let vx = state.ball.velocity.x;
        let vy = state.ball.velocity.y;
        let px = state.ball.position.x;
        let py = state.ball.position.y;

        // ==========================================
        // ★修正：壁での大袈裟な反射 ＆ 真横ループの完全排除
        // ==========================================
        // 1. 壁や天井に近づいたら、強制的に「逆方向＋少し強めの力」で弾き返す
        if (px < 30) vx = Math.abs(vx) + 2; // 左壁 -> 右へ
        if (px > cw - 30) vx = -Math.abs(vx) - 2; // 右壁 -> 左へ
        if (py < 30) vy = Math.abs(vy) + 2; // 天井 -> 絶対に下へ

        // 2. 進行方向が「真横」になるのを完全に防ぐ（最低でも約22度の角度を保証）
        if (Math.abs(vy) < Math.abs(vx) * 0.4) {
          vy = (vy >= 0 ? 1 : -1) * Math.abs(vx) * 0.4;
        }

        // 3. スピードがゼロに近づくのを防ぐ
        if (Math.abs(vy) < 1.5) vy = vy >= 0 ? 1.5 : -1.5;
        if (Math.abs(vx) < 1.5) vx = vx >= 0 ? 1.5 : -1.5;

        const speed = Math.hypot(vx, vy);
        if (speed > 0)
          Matter.Body.setVelocity(state.ball, {
            x: (vx / speed) * activeBallSpeed,
            y: (vy / speed) * activeBallSpeed,
          });
      }
    }

    if (
      state.playerA.x !== 0 &&
      state.playerB.x !== 0 &&
      state.gameState === 'playing'
    ) {
      let distance = Math.hypot(
        state.playerB.x - state.playerA.x,
        state.playerB.y - state.playerA.y,
      );
      let cx = (state.playerA.x + state.playerB.x) / 2,
        cy = (state.playerA.y + state.playerB.y) / 2;
      const ratio = Math.min(distance / activeThreshold, 1);
      const r = Math.floor(255 * ratio),
        g = Math.floor(255 * (1 - ratio));

      ctx.lineCap = 'round';
      if (distance < activeThreshold) {
        ctx.lineWidth = PADDLE_THICKNESS;
        if (state.isLongBar) {
          ctx.strokeStyle = `rgb(255, 200, 50)`;
        } else {
          ctx.strokeStyle = `rgb(${r}, ${g}, 200)`;
        }
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.setLineDash([]);
      } else {
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.4)';
        ctx.shadowBlur = 0;
        ctx.setLineDash([10, 20]);
      }
      ctx.beginPath();
      ctx.moveTo(state.playerA.x, state.playerA.y);
      ctx.lineTo(state.playerB.x, state.playerB.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      if (!state.ball && distance >= activeThreshold) {
        ctx.fillStyle = '#fff';
        ctx.font = '24px bold sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#000';
        ctx.fillText('手を近づけてボールを出す！', cx, cy - 40);
        ctx.shadowBlur = 0;
      } else if (state.ball && state.isHoldingBall) {
        let remaining = Math.ceil((state.launchTime - now) / 1000);
        if (remaining > 0) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 28px sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowBlur = 5;
          ctx.shadowColor = '#000';
          ctx.fillText(
            `${remaining}秒後に発射！`,
            state.ball.position.x,
            state.ball.position.y - 30,
          );
          ctx.shadowBlur = 0;
        }
      }

      drawHandMarker(ctx, state.playerA.x, state.playerA.y, 'A');
      drawHandMarker(ctx, state.playerB.x, state.playerB.y, 'B');
    } else if (
      (state.playerA.x === 0 || state.playerB.x === 0) &&
      state.gameState === 'playing'
    ) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#000';
      ctx.fillText('カメラに両手をかざしてね！', cw / 2, ch / 2 + 60);
      ctx.shadowBlur = 0;
    }

    if (state.gameState === 'playing') {
      ctx.fillStyle = '#fff';
      ctx.font = '30px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`LIFE: ${'❤️'.repeat(state.lives)}`, 30, 60);
      ctx.fillStyle = '#ffcc00';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `HIGH SCORE: ${Math.max(parseInt(localStorage.getItem('breakout_highscore') || '0', 10), state.score)}`,
        cw / 2,
        40,
      );
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(`SCORE: ${state.score}`, cw - 30, 60);

      let effectText = [];
      if (state.isGuardMode)
        effectText.push(
          `🛡️ ガード: 残り ${Math.ceil((state.guardTimer - now) / 1000)}秒`,
        );
      if (state.isLongBar)
        effectText.push(
          `↔️ ロング: 残り ${Math.ceil((state.longBarTimer - now) / 1000)}秒`,
        );

      if (effectText.length > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff00ff';
        effectText.forEach((text, idx) => {
          ctx.fillText(text, cw / 2, ch - 80 + idx * 30);
        });
        ctx.shadowBlur = 0;
      }
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.textAlign = 'center';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#000';
      if (state.gameState === 'gameover') {
        ctx.fillStyle = '#ff3333';
        ctx.font = '80px bold sans-serif';
        ctx.fillText('TIME UP / GAME OVER', cw / 2, ch / 2 - 60);
        ctx.fillStyle = '#00ffcc';
        ctx.font = '100px bold sans-serif';
        ctx.fillText(`SCORE: ${state.score}`, cw / 2, ch / 2 + 60);
        if (state.isNewRecord) {
          ctx.fillStyle = '#ffcc00';
          ctx.font = 'bold 60px sans-serif';
          ctx.shadowColor = '#ff5500';
          ctx.fillText('🎉 NEW RECORD!! 🎉', cw / 2, ch / 2 - 160);
        }
      }
      ctx.shadowBlur = 0;

      if (state.playerA.x !== 0 && state.playerB.x !== 0) {
        let distance = Math.hypot(
          state.playerB.x - state.playerA.x,
          state.playerB.y - state.playerA.y,
        );
        const ratio = Math.min(distance / thresholdDistance, 1);
        const r = Math.floor(255 * ratio),
          g = Math.floor(255 * (1 - ratio));

        ctx.lineCap = 'round';
        if (distance < thresholdDistance) {
          ctx.lineWidth = 15;
          ctx.strokeStyle = `rgb(${r}, ${g}, 200)`;
          ctx.shadowBlur = 15;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.setLineDash([]);
        } else {
          ctx.lineWidth = 5;
          ctx.strokeStyle = 'rgba(255, 50, 50, 0.4)';
          ctx.shadowBlur = 0;
          ctx.setLineDash([10, 20]);
        }
        ctx.beginPath();
        ctx.moveTo(state.playerA.x, state.playerA.y);
        ctx.lineTo(state.playerB.x, state.playerB.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        drawHandMarker(ctx, state.playerA.x, state.playerA.y, 'A');
        drawHandMarker(ctx, state.playerB.x, state.playerB.y, 'B');

        if (distance < thresholdDistance) {
          if (!autoStartStartTimeRef.current)
            autoStartStartTimeRef.current = Date.now();
          const elapsed = Date.now() - autoStartStartTimeRef.current;
          const remaining = Math.ceil((AUTO_START_DELAY - elapsed) / 1000);

          if (remaining > 0) {
            ctx.fillStyle = '#00ffcc';
            ctx.font = 'bold 30px sans-serif';
            ctx.fillText(
              `調整画面に戻ります: ${remaining}`,
              cw / 2,
              ch / 2 + 150,
            );
          }
          if (elapsed >= AUTO_START_DELAY) {
            autoStartStartTimeRef.current = null;
            handleBackToSetup();
            return;
          }
        } else {
          autoStartStartTimeRef.current = null;
          ctx.fillStyle = '#fff';
          ctx.font = '24px sans-serif';
          ctx.fillText(
            '2人で手を近づけて3秒キープで最初の画面に戻るよ',
            cw / 2,
            ch / 2 + 150,
          );
        }
      } else {
        autoStartStartTimeRef.current = null;
        ctx.fillStyle = '#fff';
        ctx.font = '24px sans-serif';
        ctx.fillText(
          'カメラに両手をかざして、手を近づけると最初の画面に戻るよ',
          cw / 2,
          ch / 2 + 150,
        );
      }
    }
  };

  const handleStartGame = () => {
    setCurrentMode('game');
    setTimeout(() => {
      resizeCanvases();
      startGame();
    }, 50);
  };

  const handleBackToSetup = () => {
    setCurrentMode('setup');
    stopGame();
    setTimeout(resizeCanvases, 50);
  };

  return (
    <div className="container">
      <video
        ref={videoRef}
        id="video-element"
        playsInline
        autoPlay
        muted
      ></video>
      {statusMsg && <div id="status-overlay">{statusMsg}</div>}

      <div
        id="setup-screen"
        style={{ display: currentMode === 'setup' ? 'block' : 'none' }}
      >
        <canvas
          id="setup-canvas"
          ref={setupCanvasRef}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        ></canvas>

        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 10,
            width: '90%',
            maxWidth: '450px',
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '15px',
              backdropFilter: 'blur(8px)',
              padding: '20px',
              color: '#fff',
              fontSize: '14px',
              lineHeight: '1.6',
              boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            }}
          >
            <h2
              style={{
                margin: '0 0 15px 0',
                fontSize: '20px',
                color: '#00ffcc',
                borderBottom: '1px solid rgba(255,255,255,0.3)',
                paddingBottom: '8px',
              }}
            >
              🎮 遊び方 ＆ ルール
            </h2>

            <h3
              style={{
                margin: '15px 0 5px 0',
                fontSize: '16px',
                color: '#ffcc00',
              }}
            >
              【基本ルール】
            </h3>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li>2人1組で協力するブロック崩しゲームです。</li>
              <li>
                2人の「手と手」を近づけると、ボールを跳ね返すバーが出現します。
              </li>
              <li>
                腕を下げ、手のひらをしっかり画面に向けると認識しやすくなります。
                <br />
                <span style={{ fontSize: '12px', color: '#aaa' }}>
                  ※使わない方の手は画面に映らないよう後ろに隠してください。
                </span>
              </li>
            </ul>

            <h3
              style={{
                margin: '15px 0 5px 0',
                fontSize: '16px',
                color: '#ffcc00',
              }}
            >
              【ゲームの進め方】
            </h3>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li>この画面でバーを作って「3秒キープ」するとゲームスタート！</li>
              <li>
                ボールは、バーの上に出現してから「3秒後」に自動で発射されます。
              </li>
              <li>
                下に落とさないよう、2人の息を合わせてボールを跳ね返しましょう！
              </li>
              <li>ブロックを壊すと100点！時間経過でどんどん復活します。</li>
            </ul>

            <h3
              style={{
                margin: '15px 0 5px 0',
                fontSize: '16px',
                color: '#ffcc00',
              }}
            >
              【アイテム（ブロックから確率で出現）】
            </h3>
            <ul
              style={{
                marginTop: '5px',
                paddingLeft: '10px',
                listStyleType: 'none',
                background: 'rgba(255,255,255,0.1)',
                padding: '10px',
                borderRadius: '8px',
              }}
            >
              <li style={{ marginBottom: '5px' }}>
                💖 <strong style={{ color: '#ff3366' }}>LIFE</strong> :
                ライフが1回復（超レア！）
              </li>
              <li style={{ marginBottom: '5px' }}>
                🛡️ <strong style={{ color: '#33ccff' }}>GUARD</strong> :
                10秒間、左右に動くお助けバリアが出現
              </li>
              <li>
                ↔️ <strong style={{ color: '#ccff33' }}>LONG</strong> :
                10秒間、バーが切れにくくなる
              </li>
            </ul>

            <div
              style={{
                marginTop: '20px',
                padding: '10px',
                textAlign: 'center',
                background: 'linear-gradient(45deg, #ffcc00, #ff5500)',
                borderRadius: '8px',
                color: '#000',
                fontWeight: 'bold',
                fontSize: '18px',
              }}
            >
              🏆 現在のハイスコア: {highScore}
            </div>
          </div>
        </div>

        <div
          className="controls"
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '95%',
            maxWidth: '800px',
            padding: '10px 20px',
            background: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '50px',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'row',
            gap: '15px',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
            }}
          >
            <label
              className="switch"
              style={{ width: '36px', height: '20px', margin: 0 }}
            >
              <input
                type="checkbox"
                checked={isCameraOn}
                onChange={(e) => setIsCameraOn(e.target.checked)}
              />
              <span className="slider" style={{ borderRadius: '20px' }}></span>
            </label>
            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>AI起動</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flex: 1,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '12px', color: '#aaa' }}>
              閾値:{thresholdDistance}px
            </span>
            <input
              type="range"
              min="50"
              max="1000"
              value={thresholdDistance}
              onChange={(e) => setThresholdDistance(Number(e.target.value))}
              style={{ flex: 1, minWidth: '80px', margin: 0 }}
            />
            <span
              id="distance-display"
              ref={distanceTextRef}
              style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#00ffcc',
                minWidth: '80px',
                textAlign: 'right',
              }}
            >
              距離: ---px
            </span>
          </div>

          <button
            id="start-btn"
            onClick={handleStartGame}
            disabled={!canStart}
            style={{
              background: canStart ? '#00ffcc' : '#555',
              color: canStart ? '#000' : '#ccc',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '20px',
              cursor: canStart ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
              transition: '0.3s',
              minWidth: 'auto',
              margin: 0,
            }}
          >
            {canStart
              ? '3秒キープで開始！'
              : isAIReadyState
                ? '手を近づけて待機'
                : 'AI起動待ち'}
          </button>
        </div>
      </div>

      <div
        id="game-screen"
        style={{ display: currentMode === 'game' ? 'block' : 'none' }}
      >
        <button
          id="back-btn"
          onClick={handleBackToSetup}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            borderRadius: '20px',
            position: 'absolute',
            right: '20px',
            bottom: '20px',
            zIndex: 100,
          }}
        >
          ← 調整に戻る
        </button>
        <canvas id="bg-canvas" ref={bgCanvasRef}></canvas>
        <canvas id="game-canvas" ref={gameCanvasRef}></canvas>
      </div>
    </div>
  );
}
