import React, { useState, useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';
import './index.css';

// --- ゲーム設定定数 ---
const BALL_SPEED = 8;
const PADDLE_THICKNESS = 30;
const RESPAWN_TIME = 5000;

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
  const startBtnRef = useRef(null);

  const isAIReadyRef = useRef(false);
  const canStartRef = useRef(false);

  // AIとゲーム用のRef
  const engineRef = useRef(null);
  const renderLoopIdRef = useRef(null);
  const handsRef = useRef(null); // ★ Hands用に変更
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
  });

  const resizeCanvases = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (setupViewRef.current && setupCanvasRef.current) {
      const viewRect = setupViewRef.current.getBoundingClientRect();
      if (viewRect.width > 0) {
        setupCanvasRef.current.width = viewRect.width;
        setupCanvasRef.current.height = viewRect.height;
      }
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
  // ★ AI (MediaPipe Hands) の初期化
  // ==========================================
  useEffect(() => {
    const hands = new window.Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 2, // ★ 画面内で最大2つの手だけを検知する
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

      let pA = null,
        pB = null;

      // ★ 手の検知ロジック
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // 全ての手の「手のひら中央（9番：中指の付け根）」の座標を取得し、X座標（左から右）でソート
        const handPositions = results.multiHandLandmarks
          .map((landmarks) => {
            let palm = landmarks[9];
            return { x: 1 - palm.x, y: palm.y }; // カメラ反転
          })
          .sort((a, b) => a.x - b.x);

        if (handPositions.length >= 2) {
          pA = handPositions[0]; // 左手（左の人）
          pB = handPositions[1]; // 右手（右の人）
        } else if (handPositions.length === 1) {
          if (handPositions[0].x < 0.5) pA = handPositions[0];
          else pB = handPositions[0];
        }
      }

      if (currentMode === 'setup') {
        renderSetupView(results, pA, pB);
      } else if (currentMode === 'game') {
        renderGameBackground(results);
        if (pA)
          gameData.current.playerA = {
            x: pA.x * window.innerWidth,
            y: pA.y * window.innerHeight,
          };
        else gameData.current.playerA = { x: 0, y: 0 };

        if (pB)
          gameData.current.playerB = {
            x: pB.x * window.innerWidth,
            y: pB.y * window.innerHeight,
          };
        else gameData.current.playerB = { x: 0, y: 0 };
      }
    });

    handsRef.current = hands;

    return () => {
      if (handsRef.current) handsRef.current.close();
    };
  }, [isCameraOn, currentMode, thresholdDistance]);

  useEffect(() => {
    if (isCameraOn) {
      setStatusMsg('カメラ・AI（ハンドトラッキング）を起動中...');
      navigator.mediaDevices
        .getUserMedia({ video: { width: 1280, height: 720 } })
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
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      if (setupCanvasRef.current) {
        const ctx = setupCanvasRef.current.getContext('2d');
        ctx.clearRect(
          0,
          0,
          setupCanvasRef.current.width,
          setupCanvasRef.current.height,
        );
      }
    }
  }, [isCameraOn]);

  const renderSetupView = (results, rawPA, rawPB) => {
    const canvas = setupCanvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width,
      ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    if (results.image) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, -cw, 0, cw, ch);
      ctx.restore();

      // ★デバッグ表示：検知した手の「手のひら」にピンクの点を打つ
      if (results.multiHandLandmarks) {
        ctx.fillStyle = '#ff007f';
        results.multiHandLandmarks.forEach((landmarks) => {
          let nx = (1 - landmarks[9].x) * cw;
          let ny = landmarks[9].y * ch;
          ctx.beginPath();
          ctx.arc(nx, ny, 10, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    let pA = { x: 0, y: 0 },
      pB = { x: 0, y: 0 };
    if (rawPA) pA = { x: rawPA.x * cw, y: rawPA.y * ch };
    if (rawPB) pB = { x: rawPB.x * cw, y: rawPB.y * ch };

    const distance = Math.hypot(pB.x - pA.x, pB.y - pA.y);

    if (distanceTextRef.current)
      distanceTextRef.current.textContent = `${Math.floor(distance)} px`;

    // マーカーのラベルを「Hand A」「Hand B」に変更
    drawHandMarker(ctx, pA.x, pA.y, 'Hand A');
    drawHandMarker(ctx, pB.x, pB.y, 'Hand B');

    const ratio = Math.min(distance / thresholdDistance, 1);
    const r = Math.floor(255 * ratio),
      g = Math.floor(255 * (1 - ratio));

    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    if (distance < thresholdDistance && pA.x !== 0 && pB.x !== 0) {
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
      const isReady = distance < thresholdDistance && pA.x !== 0 && pB.x !== 0;
      if (isReady !== canStartRef.current) {
        canStartRef.current = isReady;
        setCanStart(isReady);
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
    // 小さい文字で表示
    ctx.fillStyle = '#fff';
    ctx.font = '12px bold sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 4);
  };

  // ==========================================
  // ゲームの開始・停止
  // ==========================================
  const startGame = () => {
    engineRef.current = Matter.Engine.create();
    engineRef.current.gravity.y = 0;

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
    };

    resizeCanvases();
    createBlocks();
    createBall();

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
      Matter.Bodies.rectangle(w / 2, h + 25, w, 50, {
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
    const w = (cw - padding * (cols + 1)) / cols;
    const h = 40;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let x = padding + c * (w + padding) + w / 2;
        let y = ch - 100 - r * (h + padding) - h / 2;
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

  const createBall = () => {
    gameData.current.ball = Matter.Bodies.circle(
      window.innerWidth / 2,
      window.innerHeight / 2,
      20,
      {
        restitution: 1.05,
        friction: 0,
        frictionAir: 0,
        inertia: Infinity,
        label: 'ball',
      },
    );
    Matter.World.add(engineRef.current.world, gameData.current.ball);
  };

  const handleBlockHit = (blockBody) => {
    if (!gameData.current.blocks.includes(blockBody)) return;
    gameData.current.score += 100;
    Matter.Composite.remove(engineRef.current.world, blockBody);
    gameData.current.blocks = gameData.current.blocks.filter(
      (b) => b !== blockBody,
    );

    gameData.current.respawnQueue.push({
      x: blockBody.position.x,
      y: blockBody.position.y,
      w: blockBody.customW,
      h: blockBody.customH,
      color: blockBody.renderColor,
      respawnAt: Date.now() + RESPAWN_TIME,
    });
  };

  const renderGameBackground = (results) => {
    const canvas = bgCanvasRef.current;
    if (!canvas || canvas.width === 0 || !results.image) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, -canvas.width, 0, canvas.width, canvas.height);
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
      let cx = (state.playerA.x + state.playerB.x) / 2;
      let cy = (state.playerA.y + state.playerB.y) / 2;

      if (distance < thresholdDistance) {
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
      }

      if (state.ball && state.isHoldingBall) {
        Matter.Body.setPosition(state.ball, {
          x: cx,
          y: cy + PADDLE_THICKNESS + 10,
        });
        Matter.Body.setVelocity(state.ball, { x: 0, y: 0 });

        if (distance < thresholdDistance) {
          state.isReadyToDrop = true;
        } else if (distance >= thresholdDistance && state.isReadyToDrop) {
          state.isHoldingBall = false;
          state.isReadyToDrop = false;
          let xDir = Math.random() > 0.5 ? 1 : -1;
          let xSpeed = BALL_SPEED * (0.2 + Math.random() * 0.2);
          Matter.Body.setVelocity(state.ball, {
            x: xSpeed * xDir,
            y: BALL_SPEED,
          });
        }
      }
    }

    if (state.gameState === 'playing') {
      const now = Date.now();
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

    if (state.ball && state.gameState === 'playing') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(state.ball.position.x, state.ball.position.y, 20, 0, 2 * Math.PI);
      ctx.fill();

      if (state.ball.position.y < -50) {
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
          state.isHoldingBall = true;
          state.isReadyToDrop = false;
        }
      }

      if (state.ball && !state.isHoldingBall) {
        const speed = Math.hypot(state.ball.velocity.x, state.ball.velocity.y);
        if (speed > 0)
          Matter.Body.setVelocity(state.ball, {
            x: (state.ball.velocity.x / speed) * BALL_SPEED,
            y: (state.ball.velocity.y / speed) * BALL_SPEED,
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
      const ratio = Math.min(distance / thresholdDistance, 1);
      const r = Math.floor(255 * ratio),
        g = Math.floor(255 * (1 - ratio));

      ctx.lineWidth = PADDLE_THICKNESS;
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

      if (
        state.isHoldingBall &&
        state.isReadyToDrop &&
        distance < thresholdDistance
      ) {
        ctx.fillStyle = '#fff';
        ctx.font = '24px bold sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#000';
        // メッセージを手に合わせて変更
        ctx.fillText(
          '手を離してドロップ！',
          (state.playerA.x + state.playerB.x) / 2,
          (state.playerA.y + state.playerB.y) / 2 - 30,
        );
        ctx.shadowBlur = 0;
      }
      drawHandMarker(ctx, state.playerA.x, state.playerA.y, 'A');
      drawHandMarker(ctx, state.playerB.x, state.playerB.y, 'B');
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
        style={{ display: currentMode === 'setup' ? 'flex' : 'none' }}
      >
        <div id="setup-view" ref={setupViewRef}>
          <div id="setup-highscore">
            本日のハイスコア: <span>{highScore}</span>
          </div>
          <canvas id="setup-canvas" ref={setupCanvasRef}></canvas>
        </div>

        <div className="controls">
          <div className="control-group">
            <div className="switch-row">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={isCameraOn}
                  onChange={(e) => setIsCameraOn(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
              <span>カメラON (AI起動)</span>
            </div>
          </div>

          <div className="control-group" style={{ flex: 1 }}>
            <label>
              バーが繋がる限界距離 (閾値): <span>{thresholdDistance}</span>px
            </label>
            <input
              type="range"
              min="50"
              max="1000"
              value={thresholdDistance}
              onChange={(e) => setThresholdDistance(Number(e.target.value))}
            />
            <label>現在の手の距離:</label>
            <div id="distance-display" ref={distanceTextRef}>
              --- px
            </div>
          </div>

          <div className="start-btn-container">
            <button
              id="start-btn"
              onClick={handleStartGame}
              disabled={!canStart}
              style={{
                background: canStart ? '#00ffcc' : '#555',
                color: canStart ? '#000' : '#ccc',
              }}
            >
              {canStart
                ? '準備完了！ゲームスタート！'
                : isAIReadyState
                  ? '2人で手を近づけてバーを繋ぐとスタート！'
                  : 'AIを起動してください'}
            </button>
          </div>
        </div>
      </div>

      <div
        id="game-screen"
        style={{ display: currentMode === 'game' ? 'block' : 'none' }}
      >
        <button id="back-btn" onClick={handleBackToSetup}>
          ← 調整に戻る
        </button>
        <canvas id="bg-canvas" ref={bgCanvasRef}></canvas>
        <canvas id="game-canvas" ref={gameCanvasRef}></canvas>
      </div>
    </div>
  );
}
