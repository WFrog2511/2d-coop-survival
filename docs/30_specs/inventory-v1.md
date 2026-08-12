---
id: SPEC-INVENTORY-V1
requirements: REQ-INVENTORY-V1
---

# inventory-v1 仕様

## 状態

- `CombatState.inventory` は`WeaponId`ごとの`weaponCounts`と素材種別ごとの`materials`だけを保持する純粋stateである。初期値は rifle 1、shotgun 0、handgun 0、スクラップ0個とする。
- `collectWeapon` はterminal以外で、未所持のライフルまたはショットガンを1だけ加算する。すでに所持するライフルまたはショットガンの重複pickupは元のstateを返し、ハンドガンだけは所持数に上限なく1ずつ加算する。`collectMaterial` は正の安全な整数だけを加算し、terminalまたは不正な素材数は元のstateを返す。
- `selectWeapon` はterminalまたは所持数0のweaponで元のstateを返す。handgunは`WeaponId`として`CombatState`のammo、reserve、reloadを1組だけ使うため、複数pickupによる個別弾薬stateは存在しない。`WEAPONS.handgun`はライフルのdamage type、damage、speed、range、spread、knockback、reloadを使い、`automatic=false`、magazine 10、予備弾設定は`HANDGUN_AMMO`から得る。
- `retryCombat` はinventoryの各recordも深く複製した初期stateを返す。

## world itemと配置

- `main.ts` は Phaser static group とIDごとの小さなmapで world item を保持する。初期ショットガンIDは`weapon-shotgun`、初期ハンドガンIDは`weapon-handgun-<n>`、スクラップIDは`material-scrap-<x>,<y>`とする。
- `selectInitialWeaponPickupTiles` は開始tileと弾薬箱・ショットガンおよびそれらの3x3近傍を除外し、開始位置から到達可能なfloorを決定的に選ぶ。選んだweapon同士も互いの3x3取得範囲を重ねない。近い候補がなければ、到達可能な残り候補から決定的に選ぶ。`HANDGUN_WORLD_PICKUP_COUNT`件がそろわない場合、`buildWorldItems`はweaponを一部だけspawnせず失敗する。マップ生成規約は変更しない。
- `scheduleDefeatedEnemy` は敵を無効化する前のtileを取得し、敵種別の`SCRAP_DROP_AMOUNTS`を同tileのスクラップへ加える。同IDがある場合はspriteを増やさず数量を加算し、`scrapVisualTierFor`に対応するsmall／medium／large textureと観測用tierを更新する。
- enemy spawnと弾薬箱再出現のoccupiedにはactiveなworld item tileも含め、active world itemと同tileへ再配置しない。

## 取得とHUD

- `nearbyPickup` はactiveで`collectAmmoBoxState(this.state).collected`がtrueになる弾薬箱と、activeなweapon、materialを既存`selectNearbyPickup(player, anchor, candidates)`へまとめて渡す。満タンで補給不能な弾薬箱は候補から除外する。3x3、anchor距離、player距離、y、xの既存順序を維持し、完全同順位は候補IDの接頭辞で弾薬箱、weapon、materialの順に1件だけ選ぶ。
- `E`はterminalで無副作用とし、弾薬箱は既存`collectAmmoBox`、weaponは`collectWeapon`、materialは`collectMaterial`へ1回だけ委譲する。取得済みworld itemはstatic groupとID mapから同時に除去する。
- `data-testid="weapon-slot-rifle"`、`weapon-slot-shotgun`、`weapon-slot-handgun`は`data-key`、`data-weapon`、`data-owned`、`data-count`、`data-selected`を持つ。`data-testid="scrap"` は`data-count`を持つ。hiddenな`world-item-count[data-world-items]`はE2E観測用で、stable ID、種別、内容、tile、数量、素材ならtierを並べる。

## terminalと検証

- defeat / victory後は既存terminal停止によりpickup promptを隠し、`collectNearbyPickup`もstateを変更しない。retryは新map、初期weapon world item、初期inventory、weapon数、shared ammo stateを再構築する。
- `tests/rules.test.ts` はweapon数、ライフルとショットガンのsingleton pickup、未所持選択、素材加算、terminal、ハンドガンshared ammo、deep retry resetを確認する。
- `tests/arena-map.test.ts` は初期weapon tile群の決定性、弾薬箱との非重複、到達可能性、pickup範囲の非重複を確認する。
- `tests/pickups.test.ts` は共通selectorの3x3、照準優先、決定性を確認する。
- `e2e/prototype.spec.ts` はweapon取得前後のslot、同tileスクラップ集約、`E`による1回取得、terminal停止、retry初期化を確認する。敵drop量や配置距離などの調整値そのものは固定assertしない。
