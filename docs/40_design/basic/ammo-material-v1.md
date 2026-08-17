---
id: DESIGN-BASIC-AMMO-MATERIAL-V1
requirements: REQ-AMMO-MATERIAL-V1
specification: SPEC-AMMO-MATERIAL-V1
---

# ammo-material-v1 基本設計

## 方針

既存の純粋CombatState、Phaser TimerEvent、bullet pool、Arcade collider、world static group、DOM HUD、native drag and dropを拡張する。AmmoTypeや武器別reserveを継承するadapterは作らず、素材とWeaponInstanceを最小の状態として一度だけ導入する。新しいinventory、loot、effect、weapon Actor、依存は追加しない。

| 責務 | 実装経路 |
| --- | --- |
| 素材、武器モデル、調整設定 | src/ammo-data.ts の AMMO_MATERIALS、WEAPONS、7 WeaponModel |
| 個別弾倉と純粋遷移 | src/rules.ts の WeaponInstance、reload、world移動、retry |
| role別reload時間 | src/player-data.ts の reloadDurationForWorldWeapon |
| world箱、pickup、drop、Timer guard | src/main.ts の world item、reload Timer、generation、terminal/retry |
| 初期world weapon | src/game-data.ts の決定的配置 |
| bullet表示、hit、HUD | src/main.ts、src/arena/effects.ts、src/arena/hud.ts、index.html、style.css |
| 代表経路 | tests/rules.test.ts、tests/player-data.test.ts、e2e/prototype.spec.ts |

## 状態とデータの境界

AMMO_MATERIALSとWEAPONSを調整値の唯一の入口とする。InventoryState.materialsはscrapと3 AmmoMaterialの量を持ち、武器枠はWeaponInstanceを持つ。WeaponInstanceはworld、quick slot、backpackの間を同じobject値として移動する。CombatState.reloadingにはinstance IDだけを保持するため、同modelの別個体を共有状態へ解決しない。

reloadはrules側で開始と完了を分ける。main.tsだけがPhaser TimerEventを作り、完了時に同じgeneration、Timer、active instance、reloading IDである場合に限り completeReloadを呼ぶ。rules側がactual loadedと素材消費を計算するため、Sceneは素材量やpartial計算を重複しない。

## 画面とworldの導線

決定的に配置する4個の素材箱と初期world weaponは既存のtile選択・occupancy規則を使う。ポーチは3素材を表示し、native drag and dropでworld素材を作る。world weaponもworld素材も既存E selectorから一件ずつ取得する。

HUDは選択中WeaponInstanceのmodel、magazine、対応素材、reload進捗を表示する。7 weapon textureとeffectは設定のmodelを読む。火炎放射器は既存bullet poolの毎発設定で表示scaleとbody sizeを設定する。ほかの武器を発射するたびにも通常scaleとbody sizeを明示するため、pool再利用で火炎設定を残さない。

## lifecycleと失敗時

run resetはgenerationを更新してからTimerを停止し、CombatState、world item、HUDを新runに作り直す。weapon切替、weapon drop、terminalも対象instanceのreload Timerを停止する。callbackはgenerationとinstance IDを検証するので、停止競合でcallbackが届いても新runのinitial magazine、materials、HUDを変更しない。

クォーターマスターのworld weapon reloadはplayer-dataのduration multiplierで基準時間より10%長くする。素材量、発射待ち、damage、speed、range、容量、色、弾倍率は試遊用設定であり、設定値を固定するテストではなく利用経路と状態遷移を検証する。

## 意図的な非実装

連弩は自動の単発投射、火炎放射器は短射程の自動離散弾に留める。DoT、cone、地面炎、矢回収、貫通、専用Actorは追加しない。素材のstack分割、永続化、通信同期、balance自動化も対象外であり、体感値は手動試遊で再検討する。
