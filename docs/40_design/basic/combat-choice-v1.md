---
requirements: REQ-COMBAT-CHOICE
specification: SPEC-COMBAT-CHOICE
---

# combat-choice-v1 基本設計

## 責務

- `src/rules.ts`: 武器定義、武器別の残弾・発射待ち・リロード状態、4敵個体のHP減算・撃破・再出現、戦闘状態初期化を純粋関数で扱う。
- `src/main.ts`: Phaser Scene、入力、Canvasテクスチャ、敵4個体・弾プール・弾メタデータ、決定的ドローンAI、衝突、命中表示、DOM HUD、リロード、敗北と再挑戦を扱う。
- `tests/rules.test.ts`: 武器契約、時刻境界、武器別弾倉、リロード中断、敵個体別状態、player damage regression、再挑戦を検査する。
- `e2e/prototype.spec.ts`: 長押し自動射撃、ショットガンの単発待ち時間、リロード、敗北、再挑戦の利用経路を検査する。

## データと流れ

`CombatState`は選択武器、武器別の残弾と`nextFireAt`、リロード対象、`basic-1`、`basic-2`、`basic-3`、`drone-1`の個別HP/撃破状態を保持する。`WeaponDefinition`は入力方式、発射待ち、弾倉、リロード時間と弾道を持つ。純粋な`fireWeapon`は`now >= nextFireAt`かつ残弾あり・非リロード時だけ状態を更新する。Phaser Sceneはライフルのポインター長押しをupdate内で、ショットガンの1射をpointerdownで処理する。

Phaserの再利用Spriteには`Map`で弾メタデータを対応付け、選択武器の全ペレット分の空きがあるときだけ状態を更新して弾を生成する。衝突時に弾を先に無効化してから純粋状態を更新する。敵ごとのSprite、再出現タイマー、接触クールダウン、ノックバック期限、命中フィードバックタイマーをScene内部で個別に管理する。基本敵は直接追跡する。ドローンは時刻のsin値による追跡方向に直交する左右速度を加え、乱数なしのジグザグ接近を行う。

## リセットと失敗時

HUDがない場合は起動時に失敗する。弾プールが上限に達した場合は発射しない。空弾倉とリロード中は弾を生成しない。武器切替・敗北・再挑戦ではリロードタイマーを解除する。再挑戦時は再出現・命中表示のタイマーも解除し、敵4体、弾メタデータ、接触クールダウン、ノックバック、武器別残弾、発射待ち、HUDを初期化してから物理演算を再開する。旧タイマーが再挑戦後の状態を書き換えない。

## Ponytailの境界

既存のPhaser、TypeScript、DOM、Canvas生成テクスチャだけを再利用する。新規npm依存、lockfile変更、ECS、汎用entity framework、JSON/Zod基盤、workspace分割、外部assetは追加しない。広いマップ、カメラ、障害物、経路探索、予備弾薬、第三武器、追加敵種、ウェーブ、通信を追加する時点でデータ構成を再検討する。
