---
id: DESIGN-BASIC-AMMO-SUPPLY
requirements: REQ-AMMO-SUPPLY
specification: SPEC-AMMO-SUPPLY
---

# ammo-supply-v1 基本設計

既存の戦闘状態、リロード、Phaserの物理overlap、Canvas生成texture、DOM診断HUDを拡張する。新しいinventory・loot基盤や外部assetは導入しない。

| 責務 | 実装経路 |
| --- | --- |
| 数値と状態遷移 | `src/rules.ts` の武器定義、`AmmoType`対応、リロード、弾薬箱取得、retry純粋ロジック |
| 箱位置 | `src/arena-map.ts` のseed決定的な床タイル選択 |
| ゲーム統合 | `src/main.ts` の既存reload、static group、overlap、retry、HUD更新 |
| 表示 | `index.html` と `style.css` の右下DOM panel、およびTab詳細画面の弾薬ポーチ |
| 期待値 | rules/mapのunit testと代表E2E |

箱はマップ生成直後に床タイルから選び、開始位置を除外して敵spawn前に配置する。敵spawnは既存の占有tile処理で箱位置を除外する。取得時はstatic groupから対象オブジェクトを破棄し、run中の再出現を防ぐ。retryは既存のrun再初期化経路でgroupを破棄して再配置する。

リロード処理は既存のタイマーと世代管理を再利用する。空弾倉への左クリックは、Tab詳細画面が閉じているときだけ射撃処理から既存 `reload()` へ委譲し、rules側の状態ガードと既存タイマー参照で重複開始を防ぐ。詳細画面が開いている間は同じ`tryFire()`入口でpointerdownと自動長押しを停止し、手動`R`、移動、時間進行は止めない。
リロード中の進捗は既存TimerEventのgetProgress()をnative progress要素へ反映する。新しいゲーム状態やタイマーは追加せず、完了・中断・敗北・retryでは表示をリセットする。
`AMMO_TYPES`は既存`WeaponId`と表示icon・名称を対応付け、HUDは既存`reserve`からpouchを更新する。right-bottom panelは選択武器の弾倉・予備・reloadを維持し、pouchは全3弾薬種の予備だけを表示する。
## 旧combat-choice-v1の記載との関係

このsliceは、旧combat-choice-v1文書にある「予備弾薬は無制限」または「予備弾薬は対象外」という記載をsupersedeする。Issue #33で承認されたammo-supply-v1の要件・仕様・設計がこのsliceの正本である。旧文書自体は過去sliceの履歴として変更しない。
