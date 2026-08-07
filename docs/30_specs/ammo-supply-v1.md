---
id: SPEC-AMMO-SUPPLY
requirements: REQ-AMMO-SUPPLY
---

# ammo-supply-v1 仕様

## 状態

`CombatState`は武器ごとの `ammo`（弾倉）と `reserve`（予備弾薬）を保持する。武器定義は `reserveInitial`、`reserveMax`、`ammoBoxRecovery` を公開する。

| 武器 | 弾倉 | 予備初期値 | 予備上限 | 箱回復 |
| --- | ---: | ---: | ---: | ---: |
| rifle | 20 | 40 | 60 | 20 |
| shotgun | 4 | 8 | 12 | 4 |

## リロード規則

- `startReload`は敗北中、リロード中、弾倉満タン、予備弾薬0のいずれかなら状態を変更しない。
- リロード完了時は弾倉の不足分と予備弾薬の小さい方だけを移し、弾倉上限と予備弾薬上限を超えない。
- 空弾倉への射撃入力は `reload()` を呼ぶ。既にリロード中なら既存タイマーを増やさない。
- 予備弾薬0の空弾倉ではリロードタイマーを作らず、弾倉も増やさない。

## 弾薬箱と表示

弾薬箱取得時は、両武器の予備弾薬へそれぞれの回復量を加算する。上限到達後の取得は状態を変更せず、取得済み箱はrun中に再利用できない。マップ生成のseedと床タイル順から4位置を決定し、開始位置・壁・指定済み占有位置を除外する。

ゲーム領域は800x500を基準とし、ammo panelはゲーム領域の右下にDOMとして配置する。パネルの弾倉表示は `現在値/上限`、予備表示は `予備 現在値/上限` とする。

- ammo panelのprogress barはnative progress要素と既存Phaser TimerEventの進捗を同期し、state.reloadingがnullになった時点で非表示かつvalue=0へ戻す。
## 検証対象

- `tests/rules.test.ts`: 初期値、リロード、予備0、上限、箱取得。
- `tests/arena-map.test.ts`: 4位置、床・開始位置除外、重複なし、seed決定性、到達可能性。
- `e2e/prototype.spec.ts`: DOM表示、射撃、空弾倉クリックによる一度だけのリロード、`R`キー、弾薬箱取得、retry再配置。
## 旧combat-choice-v1の記載との関係

このsliceは、旧combat-choice-v1文書にある「予備弾薬は無制限」または「予備弾薬は対象外」という記載をsupersedeする。Issue #33で承認されたammo-supply-v1の要件・仕様・設計がこのsliceの正本である。旧文書自体は過去sliceの履歴として変更しない。