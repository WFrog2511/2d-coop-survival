---
id: SPEC-INVENTORY-V1
requirements: REQ-INVENTORY-V1
---

# inventory-v1 仕様

## 状態

- `CombatState.inventory` は3件の`quickSlots`、10件の`backpackSlots`、`selectedQuickSlot`、素材種別ごとの`materials`を保持する純粋stateである。各武器枠は`WeaponModel | null`で、初期値はquick slot 1のrifle、残り12枠は空、スクラップ0個とする。
- `WeaponModel`はrifle、shotgun、handgun、revolver、compact-pistolであり、`weaponIdForModel`は後ろ3モデルを既存`WeaponId`のhandgunへ解決する。`AmmoType`はrifle-ammo、shotgun-ammo、handgun-ammoをそれぞれの`WeaponId`へ一意に対応付け、sidearm modelはhandgun-ammoを共有する。`collectWeapon`はterminal以外で最初の空きquick slot、次に最初の空きbackpack slotへmodelを1件格納する。同modelもstackせず、13枠が満杯なら元のstateを返す。`collectMaterial` は正の安全な整数だけを加算し、terminalまたは不正な素材数は元のstateを返す。
- `selectQuickSlot` はterminal、範囲外、空きslotでは元のstateを返す。選択modelの`WeaponId`へ`CombatState.weapon`を更新し、別の`WeaponId`への切替だけreloadを中断する。`InventorySlotRef`を受ける`moveInventoryWeapon`は空き先へmove、占有先へswapし、`removeInventoryWeapon`はworld配置候補が確定した後にだけ成功する。いずれもselectedQuickSlotの位置を変えず、選択枠が空ならactive weaponをnullとして発射・reloadを拒否する。sidearm modelは`CombatState`のammo、reserve、reloadを1組だけ使うため、複数pickupによる個別弾薬stateは存在しない。`WEAPONS.handgun`はライフルのdamage type、damage、speed、range、spread、knockback、reloadを使い、`automatic=false`、magazine 10、予備弾設定は`HANDGUN_AMMO`から得る。
- `retryCombat` はinventoryの配列とmaterials recordを深く複製した初期stateを返す。

## world itemと配置

- `main.ts` は Phaser static group とIDごとの小さなmapで world item を保持する。初期world weapon IDは`weapon-<model>-<n>`、詳細inventoryから置いたweapon IDは`dropped-weapon-<generation>-<model>-<n>`、pouchから置いた弾薬IDは`dropped-ammo-<generation>-<AmmoType>-<n>`、スクラップIDは`material-scrap-<x>,<y>`とする。weapon entryは戦闘`WeaponId`ではなくmodelを、ammo entryは`AmmoType`、数量、worldColor、textureを保持する。
- `selectAmmoBoxTiles` は開始tile・外部occupied・既に選んだ弾薬箱の各3x3近傍を除外する。`selectInitialWeaponPickupTiles` はその弾薬箱・開始tile・既に選んだweaponの各3x3近傍を除外し、開始地点から到達可能なfloor全体をseed順位で決定的に選ぶ。これにより弾薬箱とworld weaponを含むすべての初期pickupの3x3取得範囲は重ならない。`INITIAL_WORLD_WEAPON_MODELS`全件がそろわない場合、`buildWorldItems`はweaponを一部だけspawnせず失敗する。マップ生成規約は変更しない。
- `scheduleDefeatedEnemy` は敵を無効化する前のtileを取得し、敵種別の`SCRAP_DROP_AMOUNTS`を同tileのスクラップへ加える。同IDがある場合はspriteを増やさず数量を加算し、`scrapVisualTierFor`に対応するsmall／medium／large textureと観測用tierを更新する。
- enemy spawnと弾薬箱再出現のoccupiedにはactiveなworld item tileも含め、active world itemと同tileへ再配置しない。
- `selectWorldWeaponDropTile` はplayer tileを含む到達可能floorのpath距離2以下だけを候補にし、path距離、seed/tile順で決定的に1件選ぶ。active world item、ammo box、enemy tileを渡されたoccupiedとして除外する。`main.ts` は候補がnullならremove/spawnを呼ばず、`置ける場所がありません`だけを表示する。

## 取得とHUD

- `nearbyPickup` はactiveで`collectTypedAmmoBox`の取得量が正になる種類別弾薬箱とworld ammo、activeなweapon、materialを既存`selectNearbyPickup(player, anchor, candidates)`へまとめて渡す。満タンで補給不能な弾薬候補は除外する。3x3、anchor距離、player距離、y、xの既存順序を維持し、完全同順位は候補IDの接頭辞で弾薬、weapon、materialの順に1件だけ選ぶ。
- promptは`pickup-target`と`pickup-action`の2行で、weapon model名、スクラップ数量、弾薬名称と数量、および`を拾う [E]`を表示する。`E`はterminalで無副作用とし、typed ammoは`collectTypedAmmoBox`へ、weaponは`collectWeapon`、materialは`collectMaterial`へ1回だけ委譲する。partial ammoはsprite／ID mapと残量を維持し、残量0だけをstatic groupとID mapから同時に除去する。
- 下部中央の`inventory-panel`は横並びの`quick-slot-1`〜`quick-slot-3`へ簡潔なicon、model名、選択状態を表示し、右端の`data-testid="scrap"`は`data-count`を持つ。world item総数はquickbarへ表示せず、quickbar外のhiddenな`world-item-count[data-world-items]`だけをE2E観測用に残す。詳細画面の`inventory-quick-slot-1`〜`inventory-quick-slot-3`と`backpack-slot-1`〜`backpack-slot-10`は既存`data-index`、`data-model`、`data-weapon`、`data-empty`を維持し、詳細枠だけ`data-inventory-container`と`draggable`を持つ。Tabはnonmodalの`inventory-detail`と右隣の`ammo-pouch`を同時に開閉する。pouchは各`AmmoType`のicon、名称、`reserve`を`data-ammo-type`、`data-weapon`、`data-reserve`とともに表示し、弾倉を表示しない。pouch行も`draggable`なammo drag sourceであり、`#game`へだけworld dropを委譲する。候補が確定する前はreserveを減らさない。詳細画面が開いている間、`tryFire()`はpointerdownと自動長押しを無作用にして、弾薬消費と空弾倉からの自動reloadを開始しない。manual `R`、移動、時間進行、pickup、slot選択はnonmodalのまま維持する。閲覧専用だった旧仕様は#71追加slice以前の履歴である。

## terminalと検証

- defeat / victory後は既存terminal停止によりpickup prompt、詳細画面、弾薬ポーチを閉じ、drag sourceと一時messageを消し、`collectNearbyPickup`もstateを変更しない。retryは新map、初期weapon world item、初期inventory、shared ammo state、typed stable boxを再構築してdropped ammoとpartial box状態を残さず、次のpouch表示は初期reserveを示す。HUDはSceneごとのdrop callbackだけを差し替え、DOM listenerを重複登録しない。
- `tests/rules.test.ts` はquick slot優先、backpack非stack、満杯no-op、slot選択、move/swap、選択空slotでの発射/reload拒否、AmmoTypeとsidearm shared ammo、terminal、deep retry resetを確認する。
- `tests/arena-map.test.ts` は初期weapon tile群の決定性、開始地点・弾薬箱との3x3非重複、到達可能性、pickup範囲の非重複、world dropの最短・除外・候補不足を確認する。
- `tests/pickups.test.ts` は共通selectorの3x3、照準優先、決定性を確認する。
- `e2e/prototype.spec.ts` はquickbar外のhidden world item metadata、model別weapon取得前後のquick/backpack、Tab詳細画面とpouch、Tab中の自動・単発射撃抑止と閉じた後の復帰、move/swap、weapon／ammo world dropから`E`再取得、配置不能時の無変更、同tileスクラップ集約、typed stable boxのrespawn、terminal/retryのdrag cleanupとpouch reserve初期化を確認する。敵drop量や配置距離などの調整値そのものは固定assertしない。
