---
requirements: REQ-ENEMY-VISIBILITY
specification: SPEC-ENEMY-VISIBILITY
---

# enemy-visibility-v1 基本設計

`src/arena-map.ts`へ既存map型だけを使う純粋LOSと3状態判定を置く。`src/main.ts`はenemyごとに前回player/enemy tileを保持し、変化時だけ純粋判定を呼ぶ。表示状態はSpriteのtexture、visible、alphaだけを変え、Arcade body、active、velocity、HP、path、damage、respawn timerには触れない。silhouetteは既存Canvas texture生成で描き、新規assetや依存を導入しない。加えて`src/main.ts`は単一のworld-space Graphicsを黒alpha 0.25で保持し、player tileから全arena tileへの既存`hasLineOfSight`がfalseのtileだけを暗転する。maskはmap/wall/enemy/silhouetteより前、playerより後ろとし、player tile cacheが同じupdateでは何もせず、create/spawn/respawn/retry/map再生成時だけ全tileを再描画する。

Ponytail: このsliceはローカル1人用の壁遮蔽に限定する。fog、lighting、汎用FOV、距離FOV、探索履歴、viewport cache、bitset、共有視界は実プレイで必要性が確認された時点で別Issueとして再検討する。
