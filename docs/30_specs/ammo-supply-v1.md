---
id: SPEC-AMMO-SUPPLY
requirements: REQ-AMMO-SUPPLY
---

# ammo-supply-v1 仕様

> **履歴化:** 本書全体は [SPEC-AMMO-MATERIAL-V1](ammo-material-v1.md) と [Issue #77](https://github.com/WFrog2511/2d-coop-survival/issues/77) により supersede された。AmmoType、weapon別reserve、共有弾倉の記述は現行仕様ではなく、過去sliceの履歴として保持する。

## 状態

`CombatState`は各`WeaponId`（rifle、shotgun、handgun）ごとの `ammo`（弾倉）と `reserve`（予備弾薬）を保持する。`AmmoType`（rifle-ammo、shotgun-ammo、handgun-ammo）はそれぞれの既存`WeaponId`へ一意に対応し、追加の弾薬stateを作らない。`AMMO_TYPES`はlabel、icon、WeaponId、直接調整する`boxQuantity`、worldColorを一元化する。ハンドガン、リボルバー、コンパクトピストルは1組のhandgun弾倉・予備弾薬・リロード状態を共有する。

| 武器 | 弾倉 | 予備初期値 | 予備上限 | 箱回復 |
| --- | ---: | ---: | ---: | ---: |
| rifle | 20 | 40 | 60 | 20 |
| shotgun | 4 | 8 | 12 | 4 |
| handgun（ハンドガン／リボルバー／コンパクトピストル共有） | 10 | 30 | 60 | 10 |

## リロード規則

- `startReload`は敗北中、リロード中、弾倉満タン、予備弾薬0のいずれかなら状態を変更しない。
- リロード完了時は弾倉の不足分と予備弾薬の小さい方だけを移し、弾倉上限と予備弾薬上限を超えない。
- 空弾倉への射撃入力は、Tab詳細画面が閉じている場合だけ `reload()` を呼ぶ。既にリロード中なら既存タイマーを増やさない。詳細画面が開いている間のpointerdownと自動射撃は状態を変更しない。
- 予備弾薬0の空弾倉ではリロードタイマーを作らず、弾倉も増やさない。

## 弾薬箱と表示

4個のstable弾薬箱は`boxId`ごとに決定的な`AmmoType`と現在数量を持つ。`E`入力で3x3近傍の箱またはworld弾薬を選択したときは、その種類の`reserve`だけへ数量または上限までの空きを移す。partialではactiveな箱／world itemと残量を維持し、対象reserveが満タンなら候補から除外する。空になったstable箱だけが30秒後に同じ`boxId`・種類・設定`boxQuantity`で新しい画面外floorへ再出現し、dropped ammoはrespawnしない。接触だけでは状態を変更しない。マップ生成のseedと床タイル順から4位置を決定し、開始位置・指定済み占有位置・既選択弾薬箱との3x3回収範囲、および壁を除外する。

ゲーム領域は800x500を基準とし、ammo panelはゲーム領域の右下にDOMとして配置する。パネルの弾倉表示は `現在値/上限`、予備表示は `予備 現在値/上限` とする。Tab詳細画面と同時に開く`ammo-pouch`はその右隣に置き、3つの`AmmoType`のicon、名称、現在`reserve`だけを一覧表示する。pouchは弾倉を表示せず、既存reserveを正本として更新する。各pouch行はworldだけへのdrag sourceであり、drop量は`min(reserve, boxQuantity)`、world配置候補はweapon dropと同じpath距離2・occupied除外を使う。候補なしまたはreserve 0ではstateとworldを変えない。

- ammo panelのprogress barはnative progress要素と既存Phaser TimerEventの進捗を同期し、state.reloadingがnullになった時点で非表示かつvalue=0へ戻す。
## 検証対象

- `tests/rules.test.ts`: 初期値、AmmoTypeとWeaponId・設定量・色の一意対応、sidearm共有、リロード、種類別箱のchunk／partial／full／zero、retry reserve初期化。
- `tests/arena-map.test.ts`: 箱数、床・開始位置・占有位置・相互の3x3回収範囲除外、seed決定性、到達可能性、候補不足時の残数。
- `e2e/prototype.spec.ts`: right-bottom ammo panelとpouchのDOM表示、Tab中の自動・単発射撃と空弾倉reloadの無作用、閉じた後の射撃復帰、`R`キー、typed stable boxのpartial／30秒再出現、pouchからのworld dropと`E`回収、retry reserve初期化。
## 旧combat-choice-v1の記載との関係

このsliceは、旧combat-choice-v1文書にある「予備弾薬は無制限」または「予備弾薬は対象外」という記載をsupersedeする。Issue #33で承認されたammo-supply-v1の要件・仕様・設計がこのsliceの正本である。旧文書自体は過去sliceの履歴として変更しない。

## Issue #21の旧接触取得との関係

Issue #21の接触時即時取得は[REQ-PLAYER-ACTIONS](../20_requirements/player-actions-v1.md)でsupersedeする。取得候補の3x3選択、案内表示、`E`入力は`SPEC-PLAYER-ACTIONS`を正本とする。
