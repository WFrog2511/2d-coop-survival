---
requirements: REQ-COMBAT-CHOICE
specification: SPEC-COMBAT-CHOICE
---

# combat-choice-v1 基本設計

## 責務

- `src/rules.ts`: 武器選択、敵IDごとのHP減算・撃破・再出現、戦闘状態初期化を純粋関数で扱う。
- `src/main.ts`: Phaser Scene、入力、Canvasテクスチャ、敵二体・弾プール・弾メタデータ、衝突、命中表示、DOM HUD、敗北と再挑戦を扱う。
- `tests/rules.test.ts`: 武器切替、個体別ダメージ、clamp、再挑戦の境界を検査する。
- `e2e/prototype.spec.ts`: 武器HUD、敗北、再挑戦の利用経路を検査する。

## データと流れ

`CombatState`は選択武器と`basic`・`drone`の個別HP/撃破状態を保持する。武器定義は発射数、ダメージ、速度、射程、拡散、ノックバックだけを持つ。Phaserの再利用Spriteには`Map`で弾メタデータを対応付け、衝突時に弾を先に無効化してから純粋状態を更新する。敵ごとのSprite、再出現タイマー、接触クールダウン、ノックバック期限、命中フィードバックタイマーをScene内部で個別に管理する。

## リセットと失敗時

HUDがない場合は起動時に失敗する。弾プールが上限に達した場合は発射しない。再挑戦時は再出現・命中表示のタイマーを解除し、敵、弾メタデータ、接触クールダウン、ノックバック、HUDを初期化してから物理演算を再開する。旧タイマーが再挑戦後の状態を書き換えない。

## Ponytailの境界

既存のPhaser、TypeScript、DOM、Canvas生成テクスチャだけを再利用する。新規npm依存、ECS、汎用entity framework、JSON/Zod基盤、workspace分割、外部assetは追加しない。弾薬、リロード、第三武器、他敵、回避、ウェーブ、通信を追加する時点でデータ構成を再検討する。
