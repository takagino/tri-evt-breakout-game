import React from 'react';

export default function ControlPanel({
  isCameraOn,
  setIsCameraOn,
  thresholdDistance,
  setThresholdDistance,
  distanceTextRef,
  handleStartGame,
  canStart,
  isAIReadyState,
}) {
  return (
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
  );
}
