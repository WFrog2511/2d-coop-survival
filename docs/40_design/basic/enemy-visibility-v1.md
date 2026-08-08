---
requirements: REQ-ENEMY-VISIBILITY
specification: SPEC-ENEMY-VISIBILITY
---

# enemy-visibility-v1 基本設計

`src/arena-map.ts`へ既存map型だけを使う純粋LOSと3状態判定を置く。表示適用はSpriteのtexture、visible、alphaだけを変え、visibility関数へHPやAIを混ぜない。Issue #38では別のScene policyがhidden継続時間を参照してHP維持recycleを判断するが、normal/boundary/hidden計算とsilhouette/mask presentationは変更しない。maskは単一world-space Graphics、黒alpha 0.25とし、player tile変更時だけ全tileを再描画する。

Ponytail: このsliceはローカル1人用の壁遮蔽に限定する。fog、lighting、汎用FOV、距離FOV、探索履歴、viewport cache、bitset、共有視界は実プレイで必要性が確認された時点で別Issueとして再検討する。
