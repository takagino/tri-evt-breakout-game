// ==========================================
// --- ゲーム設定定数（★ここでバランス調整が可能です） ---
// ==========================================
export const BALL_SPEED = 5; // ボールの基本速度
export const PADDLE_THICKNESS = 20; // バーの太さ
export const RESPAWN_TIME = 45000; // ブロックが復活するまでの時間（ミリ秒）
export const AUTO_START_DELAY = 5000; // バーを繋いでからスタートするまでの待機時間（ミリ秒）
export const RETURN_SETUP_DELAY = 3000; // ゲーム終了後、バーを繋いでから調整画面に戻るまでの待機時間（ミリ秒）
export const BALL_LAUNCH_DELAY = 3000; // バーを作ってからボールが自動発射されるまでの待機時間（ミリ秒）
export const ITEM_EFFECT_DURATION = 10000; // アイテムの効果時間（ミリ秒）

// --- アイテム出現確率設定 ---
export const ITEM_DROP_RATE = 0.15; // ブロックを壊した時にアイテムが落ちる全体確率 (0.2 = 20%)
export const PROB_LIFE = 0.1; // その中で LIFE が選ばれる確率 (0.10 = 10%)
export const PROB_GUARD = 0.45; // その中で GUARD が選ばれる確率 (0.45 = 45%)
export const PROB_LONG = 0.45; // その中で LONG が選ばれる確率 (0.45 = 45%)
// ※ 合計 1.0 (100%) になるようにしてください。
// ==========================================
