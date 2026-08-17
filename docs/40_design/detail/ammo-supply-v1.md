---
id: DESIGN-DETAIL-AMMO-SUPPLY
requirements: REQ-AMMO-SUPPLY
specification: SPEC-AMMO-SUPPLY
---

# ammo-supply-v1 詳細設計

> **履歴化:** 本書全体は [DESIGN-DETAIL-AMMO-MATERIAL-V1](ammo-material-v1.md) と [Issue #77](https://github.com/WFrog2511/2d-coop-survival/issues/77) により supersede された。AmmoType、weapon別reserve、共有弾倉を前提にした詳細は過去sliceの履歴として保持する。

## 状態遷移

通常状態では `ammo[weapon]` と `reserve[weapon]` を独立して保持する。`AmmoType`はrifle、shotgun、handgunの既存`WeaponId`へ一意に対応し、pouch表示も同じ`reserve[weapon]`を読む。`startReload` が成立すると `reloading` を設定し、既存タイマーの完了時に `completeReload` が不足分だけを移す。敗北・リロード中・満タン・予備0では開始要求を無副作用で終了する。

```text
通常 --弾倉不足かつ予備>0--> リロード中 --タイマー完了--> 通常
通常 --空弾倉クリックかつ予備=0--> 通常（表示のみ更新）
通常 --種類別弾薬取得--> 通常（対応reserveを上限まで加算、残量0だけ削除）
Tab詳細画面 --pointerdown / 自動長押し--> Tab詳細画面（弾薬・reload状態を変更しない）
敗北 --retry--> 新しい通常状態（初期弾薬、4箱）
```

## リロード進捗表示

リロード開始時はammo panel内のnative progress要素を表示し、既存Phaser TimerEventのgetProgress()を0..1で反映する。タイマー完了、異なる`WeaponId`への切替による中断、敗北、retryではTimerEvent停止後に非表示・value=0へ戻す。同じhandgunのsidearm model切替は進捗を維持する。表示更新は毎フレームのDOM同期だけで行い、独立した警告音・点滅状態は持たない。
## 箱配置

`selectAmmoBoxTiles(map, occupied, count)` は `floorTiles(map)` を入力とし、開始位置・占有位置・既選択箱の各3x3回収範囲を除外する。候補を `seed` と座標から決まる順位でソートし、最大4個を返す。同じmapと引数では同じ結果になり、候補不足時は存在する数だけ返す。

## ゲーム統合と失敗時動作

- `main.ts` はstable boxとdropped ammoをstatic groupで管理し、`collectTypedAmmoBox`の取得量が正の場合だけ対応reserveを更新する。partialはactive itemと残量を維持し、残量0だけを破棄する。
- 対象`WeaponId`の予備弾薬が上限なら同種の箱／world ammoは候補にせず、状態もitemも変更しない。stable boxだけは空になった後に30秒で同じ種類・設定量へ再出現し、dropped ammoはrespawnしない。
- pouch dragは`dropAmmoBox`で`min(reserve, boxQuantity)`を計算するが、既存のpath距離2 world-drop候補を先に確定する。候補なしではreserve、world item、ID sequenceを変更せず、既存の配置不能messageを表示する。
- retry開始時に既存箱とworld itemを破棄し、現在runのマップへ4個のtyped stable boxを再配置する。時間経過、waveによる補充経路は持たない。
- ammo panelは毎回の状態更新で選択武器、弾倉、予備、残箱数を更新する。Tabと同時に開くpouchは各`AmmoType`のicon、名称、予備だけを同じ状態更新で更新し、弾倉は含めない。既存診断HUDの値と併存する。

この詳細設計のTypeScript対応部分は手動同期とし、本sliceでは新しいDOCGEN transformを追加しない。
## 旧combat-choice-v1の記載との関係

このsliceは、旧combat-choice-v1文書にある「予備弾薬は無制限」または「予備弾薬は対象外」という記載をsupersedeする。Issue #33で承認されたammo-supply-v1の要件・仕様・設計がこのsliceの正本である。旧文書自体は過去sliceの履歴として変更しない。
