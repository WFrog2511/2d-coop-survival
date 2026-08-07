---
id: REQ-AMMO-SUPPLY
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/33
implementation_task: https://github.com/WFrog2511/2d-coop-survival/issues/21
---

# ammo-supply-v1 要件

## 成果物段階

Prototype standard のローカル検証用プロトタイプとする。実行中のゲーム状態はブラウザ内だけで扱い、永続化・通信同期は行わない。

## 合意済み要件

- ライフルは弾倉20発、予備弾薬の初期値40発、上限60発、弾薬箱1回の回復量20発とする。
- ショットガンは弾倉4発、予備弾薬の初期値8発、上限12発、弾薬箱1回の回復量4発とする。
- マップごとに武器共通の弾薬箱を4個配置する。箱は床タイル上に重複なく配置し、開始位置と壁には配置しない。
- 弾薬箱は同じrun中に再出現しない。retryでは旧runの箱を破棄し、4個を再配置する。
- 右下のDOM ammo panelに選択武器名、弾倉残数/上限、予備弾薬/上限を表示する。既存の診断HUDは維持する。
- 弾倉が空の状態で左クリックした場合、既存のreload処理を1回だけ開始する。予備弾薬が0ならタイマーと弾薬を生成しない。`R`キーの手動リロードは維持する。

- リロード中は右下ammo panel内にdeterminate progress barを表示し、既存タイマーの進捗に合わせて0から1へ更新する。リロード完了・武器切替による中断・敗北・retryでは非表示または0へ初期化する。
## 対象外

汎用inventory・loot・item基盤、武器別箱、時間再出現・wave補充・drop、外部asset、音声、点滅警告、新規npm依存、balance変更、永続化、マルチ同期、Issue #22、matrix/readiness/evidence、新しいDOCGEN transformは対象外とする。

## 人間確認

Issue #33のDefinition of Deliveryをプロジェクトオーナーが承認済み。実装後の技術検証と人間による受け入れ確認は別に扱う。
## 旧combat-choice-v1の記載との関係

このsliceは、旧combat-choice-v1文書にある「予備弾薬は無制限」または「予備弾薬は対象外」という記載をsupersedeする。Issue #33で承認されたammo-supply-v1の要件・仕様・設計がこのsliceの正本である。旧文書自体は過去sliceの履歴として変更しない。