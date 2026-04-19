import React from 'react';
import './index.css';
import SetupRules from './components/SetupRules';
import ControlPanel from './components/ControlPanel';
import useGameLogic from './hooks/useGameLogic';

export default function App() {
  const {
    currentMode,
    isCameraOn,
    setIsCameraOn,
    thresholdDistance,
    setThresholdDistance,
    statusMsg,
    isAIReadyState,
    canStart,
    highScore,
    videoRef,
    setupCanvasRef,
    bgCanvasRef,
    gameCanvasRef,
    distanceTextRef,
    handleStartGame,
    handleBackToSetup,
  } = useGameLogic();

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

        <SetupRules highScore={highScore} />

        <ControlPanel
          isCameraOn={isCameraOn}
          setIsCameraOn={setIsCameraOn}
          thresholdDistance={thresholdDistance}
          setThresholdDistance={setThresholdDistance}
          distanceTextRef={distanceTextRef}
          handleStartGame={handleStartGame}
          canStart={canStart}
          isAIReadyState={isAIReadyState}
        />
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
