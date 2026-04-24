import React from 'react';
import { ITEM_EFFECT_DURATION } from '../constants/game';

export default function SetupRules({ canStart }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 10,
        width: 'fit-content',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '15px',
          backdropFilter: 'blur(8px)',
          padding: '20px',
          color: '#fff',
          fontSize: '20px',
          lineHeight: '1.8',
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
          {canStart ? '🎁 アイテム情報' : '🎮 協力ブロック崩し 遊び方'}
        </h2>

        {canStart ? (
          <>
            <ul
              style={{
                margin: 0,
                paddingLeft: '10px',
                listStyleType: 'none',
                background: 'rgba(255,255,255,0.1)',
                padding: '15px',
                borderRadius: '8px',
              }}
            >
              <li style={{ marginBottom: '10px' }}>
                💖 <strong style={{ color: '#ff3366' }}>LIFE</strong> : ライフが回復（超レア!）
              </li>
              <li style={{ marginBottom: '10px' }}>
                🛡️ <strong style={{ color: '#33ccff' }}>GUARD</strong> : {ITEM_EFFECT_DURATION / 1000}秒間、バリアが出現
              </li>
              <li>
                ↔️ <strong style={{ color: '#ccff33' }}>LONG</strong> : {ITEM_EFFECT_DURATION / 1000}秒間、バーが長くなる
              </li>
            </ul>
          </>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li style={{ marginBottom: '20px' }}>
              腕を下げ、手のひらを画面に向けてください。
              <br />
              <span style={{ fontSize: '16px', color: '#ff4444ff', fontWeight: 'bold' }}>
                ※使わない方の手は、後ろに隠してください。
              </span>
            </li>
            <li>
              2人の「手と手」を近づけると、バーが出現します。
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
