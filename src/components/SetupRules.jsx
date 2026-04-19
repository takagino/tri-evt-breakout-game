import React from 'react';

export default function SetupRules({ highScore }) {
  return (
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
          <li>ボールを跳ね返す度にボールのスピードは上がります。</li>
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
  );
}
