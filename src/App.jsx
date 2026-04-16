import React, { useState, useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';
import './index.css';

// --- ゲーム設定定数 ---
const BALL_SPEED = 8;
const PADDLE_THICKNESS = 30;
const RESPAWN_TIME = 5000;
const AUTO_START_DELAY = 3000;

// ★追加：線分と点の距離を測る数学関数（アイテムとバーの当たり判定用）
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
  const setupViewRef = useRef(null);
  const distanceTextRef = useRef(null);

  const isAIReadyRef = useRef(false);
  const canStartRef = useRef(false);
  const autoStartStartTimeRef = useRef(null);

  // AIとゲーム用のRef
  const engineRef = useRef(null);
  const renderLoopIdRef = useRef(null);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);

  const gameData = useRef({
    playerA: { x: 0, y: 0 },
    playerB: { x: 0, y: 0 },
    isHoldingBall: true,
    isReadyToDrop: false,
    lives: 3,
    score: 0,
    blocks: [],
    ball: null,
    physicsPaddle: null,
    respawnQueue: [],
    gameState: 'playing',
    isNewRecord: false,
    // ★追加：アイテム管理用データ
    items: [],
    isSlowMode: false,
    slowTimer: 0,
    isLongBar: false,
    longBarTimer: 0,
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

  // ==========================================
  // AI (MediaPipe Hands) 初期化と座標補正
  // ==========================================
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

  // ==========================================
  // ★先生のソースコードと全く同じ、最も安定するカメラ起動方式
  // ==========================================
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

    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    if (isConnected) {
      ctx.strokeStyle = `rgb(${r}, ${g}, 200)`;
      ctx.shadowBlur = 15;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.setLineDash([]);
      if (distanceTextRef.current)
        distanceTextRef.current.style.color = '#00ffcc';
    } else {
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

  // ==========================================
  // ゲーム本編 (Matter.js)
  // ==========================================
  const startGame = () => {
    engineRef.current = Matter.Engine.create();
    engineRef.current.gravity.y = 0;

    autoStartStartTimeRef.current = null;

    gameData.current = {
      ...gameData.current,
      isHoldingBall: true,
      isReadyToDrop: false,
      lives: 3,
      score: 0,
      isNewRecord: false,
      respawnQueue: [],
      gameState: 'playing',
      blocks: [],
      ball: null,
      physicsPaddle: null,
      walls: [],
      // アイテム用ステータス初期化
      items: [],
      isSlowMode: false,
      slowTimer: 0,
      isLongBar: false,
      longBarTimer: 0,
    };
    resizeCanvases();
    createBlocks();

    Matter.Events.on(engineRef.current, 'collisionStart', (e) => {
      if (gameData.current.gameState !== 'playing') return;
      e.pairs.forEach((pair) => {
        if (pair.bodyA.label === 'block') handleBlockHit(pair.bodyA);
        if (pair.bodyB.label === 'block') handleBlockHit(pair.bodyB);
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
      }),
      Matter.Bodies.rectangle(w + 25, h / 2, 50, h, {
        isStatic: true,
        restitution: 1,
      }),
      Matter.Bodies.rectangle(w / 2, -25, w, 50, {
        isStatic: true,
        restitution: 1,
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
        let y = 50 + r * (h + padding) + h / 2;
        let block = Matter.Bodies.rectangle(x, y, w, h, {
          isStatic: true,
          label: 'block',
          renderColor: `hsl(${(r * 40 + c * 20) % 360}, 80%, 50%)`,
          customW: w,
          customH: h,
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

    // ★追加：アイテムスポーン判定 (20%)
    if (Math.random() < 0.2) {
      const types = ['LIFE', 'SLOW', 'LONG'];
      const type = types[Math.floor(Math.random() * types.length)];
      gameData.current.items.push({
        x: blockBody.position.x,
        y: blockBody.position.y,
        type: type,
        speed: 3,
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

    // ★追加：アイテム効果のタイマー管理
    if (state.isSlowMode && now > state.slowTimer) state.isSlowMode = false;
    if (state.isLongBar && now > state.longBarTimer) state.isLongBar = false;

    const activeBallSpeed = state.isSlowMode ? BALL_SPEED * 0.5 : BALL_SPEED;
    const activeThreshold = state.isLongBar
      ? thresholdDistance * 1.5
      : thresholdDistance;

    if (state.physicsPaddle) {
      Matter.Composite.remove(engine.world, state.physicsPaddle);
      state.physicsPaddle = null;
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
          },
        );
        Matter.World.add(engine.world, state.physicsPaddle);

        if (!state.ball) {
          createBall(cx, cy - PADDLE_THICKNESS - 10);
          state.isHoldingBall = true;
          state.isReadyToDrop = true;
        }
      }

      if (state.ball && state.isHoldingBall) {
        if (distance < activeThreshold) {
          Matter.Body.setPosition(state.ball, {
            x: cx,
            y: cy - PADDLE_THICKNESS - 10,
          });
          Matter.Body.setVelocity(state.ball, { x: 0, y: 0 });
          state.isReadyToDrop = true;
        } else if (distance >= activeThreshold && state.isReadyToDrop) {
          state.isHoldingBall = false;
          state.isReadyToDrop = false;
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
            },
          );
          state.blocks.push(newBlock);
          Matter.World.add(engine.world, newBlock);
          state.respawnQueue.splice(i, 1);
        }
      }
      Matter.Engine.update(engine);
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

    // --- ★追加：アイテムの移動、描画、当たり判定 ---
    if (state.gameState === 'playing') {
      for (let i = state.items.length - 1; i >= 0; i--) {
        let item = state.items[i];
        item.y += item.speed;

        ctx.fillStyle =
          item.type === 'LIFE'
            ? '#ff3366'
            : item.type === 'SLOW'
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
          item.type === 'LIFE' ? '💖' : item.type === 'SLOW' ? '🐢' : '↔️';
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
          else if (item.type === 'SLOW') {
            state.isSlowMode = true;
            state.slowTimer = now + 10000;
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
          state.isReadyToDrop = false;
        }
      }

      if (state.ball && !state.isHoldingBall) {
        let vx = state.ball.velocity.x;
        let vy = state.ball.velocity.y;

        // ★追加：水平無限ループ回避処理
        if (Math.abs(vy) < 1.5) {
          vy = vy < 0 ? -1.5 : 1.5;
        }

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

      ctx.lineWidth = PADDLE_THICKNESS;
      ctx.lineCap = 'round';
      if (distance < activeThreshold) {
        // ★追加：LONGアイテム中は黄金に輝く
        if (state.isLongBar) {
          ctx.strokeStyle = `rgb(255, 200, 50)`;
        } else {
          ctx.strokeStyle = `rgb(${r}, ${g}, 200)`;
        }
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.setLineDash([]);
      } else {
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
      } else if (
        state.isHoldingBall &&
        state.isReadyToDrop &&
        distance < activeThreshold
      ) {
        ctx.fillStyle = '#fff';
        ctx.font = '24px bold sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#000';
        ctx.fillText('手を離して発射！', cx, cy - 40);
        ctx.shadowBlur = 0;
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

      // --- ★追加：アイテム効果の発動中表示（画面下部） ---
      let effectText = [];
      if (state.isSlowMode)
        effectText.push(
          `🐢 スロー: 残り ${Math.ceil((state.slowTimer - now) / 1000)}秒`,
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
        ctx.lineWidth = 15;
        ctx.lineCap = 'round';
        if (distance < thresholdDistance) {
          ctx.strokeStyle = `rgb(${r}, ${g}, 200)`;
          ctx.shadowBlur = 15;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.setLineDash([]);
        } else {
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
        <div id="setup-highscore">
          本日のハイスコア: <span>{highScore}</span>
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
