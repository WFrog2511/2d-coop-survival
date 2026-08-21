---
requirements: REQ-COMBAT-CHOICE
specification: SPEC-COMBAT-CHOICE
---

# combat-choice-v1 基本設計

## Issue #77の限定supersede

[DESIGN-BASIC-AMMO-MATERIAL-V1](ammo-material-v1.md) は、WeaponId別shared ammo、5武器表、shared nextFireAtとreload、retry時の旧ammo初期化を supersede する。現行は7 WeaponModel、3マテリアル、WeaponInstanceごとのmagazineとnextFireAtを使う。既存の移動、敵、wall、map、入力、bullet pool、collider、range、hit、effect設計は維持する。

## 現行map・音響への限定supersede

[standard-arena-map-v2 基本設計](standard-arena-map-v2.md) は、本書に残る旧map寸法、幅可変通路、部屋内ランダム障害物、fallback配置だけを履歴化する。現行生成は2tile幅の通常/fallback通路、中央予約の2layer annulus、空の`obstacles`を使う。current topologyの3×3 area / 2×2 corridor分類は[runtime-area-graph-v1 基本設計](runtime-area-graph-v1.md)、音響の三modeとworld/minimap debug表示は[acoustic-graph-v1 基本設計](acoustic-graph-v1.md)が所有する。map形状の追加調整は[Issue #104](https://github.com/WFrog2511/2d-coop-survival/issues/104)まで保留し、本書の戦闘統合設計を変更しない。

> [Issue #71](https://github.com/WFrog2511/2d-coop-survival/issues/71)は、旧二武器・第三武器対象外・固定weapon種slotと、閲覧専用inventoryの設計を履歴とする。`WeaponModel`をquick slot 3件とbackpack 10件へ非stack格納し、handgun、revolver、compact-pistolを既存handgunの`WeaponId`とshared ammo stateへ解決する。詳細inventoryはnative HTML5 drag/dropでmove/swapと近傍world dropを扱う。その他のcombat-choice-v1設計は維持する。

## 責務

- `src/rules.ts`: 武器定義と弾種、敵種ごとのダメージ倍率、再現可能なドローン横速度、武器別の残弾・発射待ち・リロード状態、9基本敵・3ドローンの12敵個体のHP減算・撃破・再出現、戦闘状態初期化を純粋関数で扱う。
- `src/arena-map.ts`: 32bit seed、通常14部屋と幅1〜3タイルの通路、3列×3行の中央開始8部屋・幅2通路のfallback、到達可能性、直前と異なる再挑戦map、4近傍BFS、画面外spawn選択、再出現待ち時間を純粋関数で扱う。
- `src/main.ts`: Phaser Scene、入力、Canvasテクスチャ、ground grid、wall描画とArcade Physics、追従camera、9基本敵・3ドローンの12敵個体の経路移動、弾プール、DOM HUD、リロード、敗北と再挑戦を統合する。
- `tests/rules.test.ts`: 武器と弾種契約、敵種別ダメージ、合成横速度、武器別弾倉、リロード中断、inventory move/swap、選択空slotの無作用、敵個体別状態と戦闘初期化を検査する。
- `tests/arena-map.test.ts`: seed決定性、再挑戦map差、部屋・通路・障害物、外周wall、floor連結性、BFS、spawn、再出現待ち時間、近傍world drop候補を検査する。
- `e2e/prototype.spec.ts`: 800×500px canvasのDOM順序・初期化後の固定表示、map HUDと移動、長押し射撃、ショットガンの発射待ち、model別weapon pickup、下部quickbar、Tab詳細画面のmove/swapとworld drop、リロード、敗北、異なるmapでの再挑戦を検査する。

## データと流れ

`CombatState`は選択`WeaponId`または空のactive weapon、武器別の残弾と`nextFireAt`、リロード対象、3件のquick slot、10件のbackpack slot、選択quick slot、`basic-1`〜`basic-9`、`drone-1`〜`drone-3`の個別HP/撃破状態を保持する。`collectWeapon`は最初の空きquick slot、次の空きbackpack slotへ`WeaponModel`を1件ずつ格納し、満杯では無副作用にする。純粋なinventory transitionは枠間をmove/swapし、選択quick slotが空なら戦闘処理がactive weaponを導出しない。`weaponIdForModel`はhandgun、revolver、compact-pistolをhandgunへ解決するため、sidearm modelは弾倉・予備弾・リロード状態を共有する。`WeaponDefinition`は弾種、入力方式、発射待ち、弾倉、リロード時間と弾道を持つ。純粋な`resolveDamage`は敵種、弾種、基礎ダメージから実ダメージと耐性表示要否を返す。

`ArenaMap`はseed、80×50（3200×2000px）のwall/floor配列、通常14部屋または3列×3行の中央開始8部屋fallback、通路、1タイル障害物、player開始tileを持つ。`generateArenaMap`は最大8候補とfallbackから連結済みmapを返す。`generateFallbackArenaMap`はfallback地形を決定的に返す。`generateNextArenaMap`は最大64候補から直前とtile配置が異なるmapを返す。`findPath`はfloorだけを通る4近傍BFS、`selectSpawnTile`は未占有floorからviewport外を優先する決定的選択、`respawnDelayFor`は敵種別範囲内の決定的待ち時間を返す。

Phaser SceneはmapからGraphicsとstatic wallを構築し、world/camera boundsとplayer followを設定する。player、enemy、bulletはwallとのcolliderを持つ。Sceneはenemyごとにpath、次回探索時刻、前回player/enemy tileをcacheし、最大250ms間隔またはtile変更時にBFSを更新する。ドローンはpath方向へ既存の合成横速度を加え、wall colliderを最終的な侵入防止にする。

Phaserの再利用Spriteには`Map`で弾メタデータを対応付け、弾種も保持する。選択武器の全ペレット分の空きがあるときだけ状態を更新して弾を生成する。弾はwallまたは敵との最初の衝突で無効化する。敵ごとのSprite、再出現timer、接触クールダウン、ノックバック期限、命中表示timerを個別に管理する。

## リセットと失敗時

HUDがない場合は起動時に失敗する。map通常生成に失敗した場合は3列×3行の中央開始8部屋を上下左右へ幅2通路で接続するfallbackを使い、異なる再挑戦mapを64候補内で生成できない場合は明示的に失敗する。spawn候補がない敵はbodyを無効化し、初期配置・再出現とも1秒後に再試行する。death再出現では配置成功時だけ戦闘状態を復活させる。

弾プールが上限に達した場合は発射しない。空弾倉とリロード中は弾を生成しない。異なる`WeaponId`への武器切替・敗北・再挑戦ではリロードtimerを解除する。同じhandgunのsidearm model切替はtimerを維持する。敗北では弾を無効化する。再挑戦ではmap世代を更新し、再出現・命中表示timer、旧wall、Graphics、path cache、stable 12体の敵、弾メタデータ、接触クールダウン、ノックバック、武器別残弾、発射待ち、HUDを初期化してから物理演算を再開する。旧timer callbackは世代番号が異なる状態を書き換えない。

## Ponytailの境界

既存のPhaser、TypeScript、DOM、Canvas生成テクスチャだけを再利用する。生成は矩形部屋とL字通路、経路は4000tile・最大12敵に対するBFSへ限定する。新規npm依存、lockfile変更、A*、navmesh、汎用map/AI基盤、外部assetは追加しない。native HTML5 drag/dropは13武器枠とgame領域だけに限定し、素材drag/drop、個別弾薬、重量、容量拡張、通信、永続化は対象外とする。
