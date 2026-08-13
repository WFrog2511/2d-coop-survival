---
id: SPEC-INVENTORY-V1
requirements: REQ-INVENTORY-V1
---

# inventory-v1 仕様

## 状態

- `CombatState.inventory` は3件の`quickSlots`、10件の`backpackSlots`、`selectedQuickSlot`、素材種別ごとの`materials`を保持する純粋stateである。各武器枠は`WeaponModel | null`で、初期値はquick slot 1のrifle、残り12枠は空、スクラップ0個とする。
- `WeaponModel`はrifle、shotgun、handgun、revolver、compact-pistolであり、`weaponIdForModel`は後ろ3モデルを既存`WeaponId`のhandgunへ解決する。`collectWeapon`はterminal以外で最初の空きquick slot、次に最初の空きbackpack slotへmodelを1件格納する。同modelもstackせず、13枠が満杯なら元のstateを返す。`collectMaterial` は正の安全な整数だけを加算し、terminalまたは不正な素材数は元のstateを返す。
- `selectQuickSlot` はterminal、範囲外、空きslotでは元のstateを返す。選択modelの`WeaponId`へ`CombatState.weapon`を更新し、別の`WeaponId`への切替だけreloadを中断する。`InventorySlotRef`を受ける`moveInventoryWeapon`は空き先へmove、占有先へswapし、`removeInventoryWeapon`はworld配置候補が確定した後にだけ成功する。いずれもselectedQuickSlotの位置を変えず、選択枠が空ならactive weaponをnullとして発射・reloadを拒否する。sidearm modelは`CombatState`のammo、reserve、reloadを1組だけ使うため、複数pickupによる個別弾薬stateは存在しない。`WEAPONS.handgun`はライフルのdamage type、damage、speed、range、spread、knockback、reloadを使い、`automatic=false`、magazine 10、予備弾設定は`HANDGUN_AMMO`から得る。
- `retryCombat` はinventoryの配列とmaterials recordを深く複製した初期stateを返す。

## world itemと配置

- `main.ts` は Phaser static group とIDごとの小さなmapで world item を保持する。初期world weapon IDは`weapon-<model>-<n>`、詳細inventoryから置いたweapon IDは`dropped-weapon-<generation>-<model>-<n>`、スクラップIDは`material-scrap-<x>,<y>`とする。weapon entryは戦闘`WeaponId`ではなくmodelを保持する。
- `selectAmmoBoxTiles` は開始tile・外部occupied・既に選んだ弾薬箱の各3x3近傍を除外する。`selectInitialWeaponPickupTiles` はその弾薬箱・開始tile・既に選んだweaponの各3x3近傍を除外し、開始地点から到達可能なfloor全体をseed順位で決定的に選ぶ。これにより弾薬箱とworld weaponを含むすべての初期pickupの3x3取得範囲は重ならない。`INITIAL_WORLD_WEAPON_MODELS`全件がそろわない場合、`buildWorldItems`はweaponを一部だけspawnせず失敗する。マップ生成規約は変更しない。
- `scheduleDefeatedEnemy` は敵を無効化する前のtileを取得し、敵種別の`SCRAP_DROP_AMOUNTS`を同tileのスクラップへ加える。同IDがある場合はspriteを増やさず数量を加算し、`scrapVisualTierFor`に対応するsmall／medium／large textureと観測用tierを更新する。
- enemy spawnと弾薬箱再出現のoccupiedにはactiveなworld item tileも含め、active world itemと同tileへ再配置しない。
- `selectWorldWeaponDropTile` はplayer tileを含む到達可能floorのpath距離2以下だけを候補にし、path距離、seed/tile順で決定的に1件選ぶ。active world item、ammo box、enemy tileを渡されたoccupiedとして除外する。`main.ts` は候補がnullならremove/spawnを呼ばず、`置ける場所がありません`だけを表示する。

## 取得とHUD

- `nearbyPickup` はactiveで`collectAmmoBoxState(this.state).collected`がtrueになる弾薬箱と、activeなweapon、materialを既存`selectNearbyPickup(player, anchor, candidates)`へまとめて渡す。満タンで補給不能な弾薬箱は候補から除外する。3x3、anchor距離、player距離、y、xの既存順序を維持し、完全同順位は候補IDの接頭辞で弾薬箱、weapon、materialの順に1件だけ選ぶ。
- promptは`pickup-target`と`pickup-action`の2行で、weapon model名と`を拾う [E]`、スクラップの数量と同じ操作、弾薬箱と`予備弾薬を補給 [E]`を表示する。`E`はterminalで無副作用とし、弾薬箱は既存`collectAmmoBox`、weaponは`collectWeapon`、materialは`collectMaterial`へ1回だけ委譲する。取得済みworld itemはstatic groupとID mapから同時に除去する。
- 下部中央の`inventory-panel`は横並びの`quick-slot-1`〜`quick-slot-3`へ簡潔なicon、model名、選択状態を表示し、右端の`data-testid="scrap"`は`data-count`を持つ。詳細画面の`inventory-quick-slot-1`〜`inventory-quick-slot-3`と`backpack-slot-1`〜`backpack-slot-10`は既存`data-index`、`data-model`、`data-weapon`、`data-empty`を維持し、詳細枠だけ`data-inventory-container`と`draggable`を持つ。Tabはnonmodalの`inventory-detail`を開閉し、native HTML5 drag/dropは空き枠へmove、占有枠へswap、`#game`へworld dropを委譲する。hiddenな`world-item-count[data-world-items]`はE2E観測用で、stable ID、種別、modelまたは素材、tile、数量、素材ならtierを並べる。閲覧専用だった旧仕様は#71追加slice以前の履歴である。

## terminalと検証

- defeat / victory後は既存terminal停止によりpickup promptと詳細画面を閉じ、drag sourceと一時messageを消し、`collectNearbyPickup`もstateを変更しない。retryは新map、初期weapon world item、初期inventory、shared ammo stateを再構築する。HUDはSceneごとのdrop callbackだけを差し替え、DOM listenerを重複登録しない。
- `tests/rules.test.ts` はquick slot優先、backpack非stack、満杯no-op、slot選択、move/swap、選択空slotでの発射/reload拒否、sidearm shared ammo、terminal、deep retry resetを確認する。
- `tests/arena-map.test.ts` は初期weapon tile群の決定性、開始地点・弾薬箱との3x3非重複、到達可能性、pickup範囲の非重複、world dropの最短・除外・候補不足を確認する。
- `tests/pickups.test.ts` は共通selectorの3x3、照準優先、決定性を確認する。
- `e2e/prototype.spec.ts` は下部quickbar、model別weapon取得前後のquick/backpack、Tab詳細画面のmove/swap、world dropから`E`再取得、配置不能時の無変更、同tileスクラップ集約、terminal/retryのdrag cleanupを確認する。敵drop量や配置距離などの調整値そのものは固定assertしない。
