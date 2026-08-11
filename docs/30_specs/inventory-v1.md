---
id: SPEC-INVENTORY-V1
requirements: REQ-INVENTORY-V1
---

# inventory-v1 仕様

## 状態

- `CombatState.inventory` は `ownedWeapons` と素材種別ごとの `materials` だけを保持する純粋stateである。初期値は rifle 所持、shotgun 未所持、スクラップ0個とする。
- `collectWeapon` は未所持武器だけを追加し、`collectMaterial` は正の安全な整数だけを加算する。terminal、重複weapon、不正な素材数は元のstateを返す。
- `selectWeapon` はterminalまたは未所持weaponで元のstateを返す。shotgun取得後のammo、reserve、reloadは既存`CombatState`の値と関数をそのまま使う。
- `retryCombat` はinventoryの各recordも深く複製した初期stateを返す。

## world itemと配置

- `main.ts` は Phaser static group とIDごとの小さなmapで world item を保持する。初期ショットガンIDは`weapon-shotgun`、スクラップIDは`material-scrap-<x>,<y>`とする。
- `selectInitialWeaponPickupTile` は開始tileと弾薬箱およびその3x3近傍を除外し、開始位置から到達可能な近いfloorを決定的に選ぶ。近い候補がなければ、到達可能な残り候補から決定的に選ぶ。マップ生成規約は変更しない。
- `scheduleDefeatedEnemy` は敵を無効化する前のtileを取得し、敵種別の`SCRAP_DROP_AMOUNTS`を同tileのスクラップへ加える。同IDがある場合はspriteを増やさず数量だけを加算する。
- enemy spawnと弾薬箱再出現のoccupiedにはactiveなworld item tileも含め、active world itemと同tileへ再配置しない。

## 取得とHUD

- `nearbyPickup` はactiveで`collectAmmoBoxState(this.state).collected`がtrueになる弾薬箱と、activeなweapon、materialを既存`selectNearbyPickup(player, anchor, candidates)`へまとめて渡す。満タンで補給不能な弾薬箱は候補から除外する。3x3、anchor距離、player距離、y、xの既存順序を維持し、完全同順位は候補IDの接頭辞で弾薬箱、weapon、materialの順に1件だけ選ぶ。
- `E`はterminalで無副作用とし、弾薬箱は既存`collectAmmoBox`、weaponは`collectWeapon`、materialは`collectMaterial`へ1回だけ委譲する。取得済みworld itemはstatic groupとID mapから同時に除去する。
- `data-testid="weapon-slot-rifle"` と `weapon-slot-shotgun` は`data-key`、`data-weapon`、`data-owned`、`data-selected`を持つ。`data-testid="scrap"` は`data-count`を持つ。hiddenな`world-item-count[data-world-items]`はE2E観測用で、stable ID、種別、内容、tile、数量を並べる。

## terminalと検証

- defeat / victory後は既存terminal停止によりpickup promptを隠し、`collectNearbyPickup`もstateを変更しない。retryは新map、初期weapon world item、初期inventoryを再構築する。
- `tests/rules.test.ts` は所有、未所持選択、素材加算、terminal、deep retry resetを確認する。
- `tests/arena-map.test.ts` は初期weapon tileの決定性、弾薬箱との非重複、到達可能性を確認する。
- `tests/pickups.test.ts` は共通selectorの3x3、照準優先、決定性を確認する。
- `e2e/prototype.spec.ts` はweapon取得前後のslot、同tileスクラップ集約、`E`による1回取得、terminal停止、retry初期化を確認する。敵drop量や配置距離などの調整値そのものは固定assertしない。
