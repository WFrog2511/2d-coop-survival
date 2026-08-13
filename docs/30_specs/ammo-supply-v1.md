---
id: SPEC-AMMO-SUPPLY
requirements: REQ-AMMO-SUPPLY
---

# ammo-supply-v1 仕様

## 状態

`CombatState`は各`WeaponId`（rifle、shotgun、handgun）ごとの `ammo`（弾倉）と `reserve`（予備弾薬）を保持する。武器定義は `reserveInitial`、`reserveMax`、`ammoBoxRecovery` を公開する。ハンドガン、リボルバー、コンパクトピストルは1組のhandgun弾倉・予備弾薬・リロード状態を共有する。

| 武器 | 弾倉 | 予備初期値 | 予備上限 | 箱回復 |
| --- | ---: | ---: | ---: | ---: |
| rifle | 20 | 40 | 60 | 20 |
| shotgun | 4 | 8 | 12 | 4 |
| handgun（ハンドガン／リボルバー／コンパクトピストル共有） | 10 | 30 | 60 | 10 |

## リロード規則

- `startReload`は敗北中、リロード中、弾倉満タン、予備弾薬0のいずれかなら状態を変更しない。
- リロード完了時は弾倉の不足分と予備弾薬の小さい方だけを移し、弾倉上限と予備弾薬上限を超えない。
- 空弾倉への射撃入力は `reload()` を呼ぶ。既にリロード中なら既存タイマーを増やさない。
- 予備弾薬0の空弾倉ではリロードタイマーを作らず、弾倉も増やさない。

## 弾薬箱と表示

`E`入力で3x3近傍の弾薬箱を選択したときは、全`WeaponId`（rifle、shotgun、handgun）の予備弾薬へそれぞれの回復量を加算する。handgun系sidearm modelは同じhandgun stateを共有するため、回復も1組だけへ適用する。接触だけでは状態を変更しない。上限到達後の取得は状態を変更せず、取得済み箱は30秒後に同じ`boxId`で新しい画面外floorへ再出現する。マップ生成のseedと床タイル順から4位置を決定し、開始位置・指定済み占有位置・既選択弾薬箱との3x3回収範囲、および壁を除外する。

ゲーム領域は800x500を基準とし、ammo panelはゲーム領域の右下にDOMとして配置する。パネルの弾倉表示は `現在値/上限`、予備表示は `予備 現在値/上限` とする。

- ammo panelのprogress barはnative progress要素と既存Phaser TimerEventの進捗を同期し、state.reloadingがnullになった時点で非表示かつvalue=0へ戻す。
## 検証対象

- `tests/rules.test.ts`: 初期値、リロード、予備0、上限、箱取得。
- `tests/arena-map.test.ts`: 箱数、床・開始位置・占有位置・相互の3x3回収範囲除外、seed決定性、到達可能性、候補不足時の残数。
- `e2e/prototype.spec.ts`: DOM表示、射撃、空弾倉クリックによる一度だけのリロード、`R`キー、接触では消費しない弾薬箱の`E`取得、30秒再出現、retry再配置。
## 旧combat-choice-v1の記載との関係

このsliceは、旧combat-choice-v1文書にある「予備弾薬は無制限」または「予備弾薬は対象外」という記載をsupersedeする。Issue #33で承認されたammo-supply-v1の要件・仕様・設計がこのsliceの正本である。旧文書自体は過去sliceの履歴として変更しない。

## Issue #21の旧接触取得との関係

Issue #21の接触時即時取得は[REQ-PLAYER-ACTIONS](../20_requirements/player-actions-v1.md)でsupersedeする。取得候補の3x3選択、案内表示、`E`入力は`SPEC-PLAYER-ACTIONS`を正本とする。
