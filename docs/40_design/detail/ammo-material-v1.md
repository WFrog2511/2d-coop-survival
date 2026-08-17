---
id: DESIGN-DETAIL-AMMO-MATERIAL-V1
requirements: REQ-AMMO-MATERIAL-V1
specification: SPEC-AMMO-MATERIAL-V1
---

# ammo-material-v1 詳細設計

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | 3マテリアル、7 weapon、WeaponInstance、reload、world補給、terminal/retry |
| 対応する基本設計 | [DESIGN-BASIC-AMMO-MATERIAL-V1](../basic/ammo-material-v1.md) |
| 対応する要件 | [REQ-AMMO-MATERIAL-V1](../../20_requirements/ammo-material-v1.md) |
| 対応する仕様 | [SPEC-AMMO-MATERIAL-V1](../../30_specs/ammo-material-v1.md) |
| 関連Issue | [Issue #77](https://github.com/WFrog2511/2d-coop-survival/issues/77) |
| ステータス | 試遊確認後に手動同期する Prototype standard slice |
| 同期方法 | TypeScriptのため手動review。自動生成ブロックと新規transformは置かず、[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31) でTypeScript対応を扱う |

## 1. 目的

旧AmmoType、reserve、WeaponId共有弾倉を置き換え、各WeaponInstanceが弾倉と射撃待ちを持つ戦闘導線を定める。プレイヤーは素材箱またはworld素材をE取得し、対応素材で選択中instanceをreloadし、weaponと素材をworldへ落として再取得できる。数値の体感は設定を変えて手動試遊し、状態遷移だけを自動検証する。

## 2. 対象範囲

| 対象 | 内容 |
| --- | --- |
| 素材 | 実弾マテリアル、投射マテリアル、特殊セルの所持、箱、world、ポーチ、HUD |
| 武器 | 既存5銃器、連弩、火炎放射器の7 modelと個別WeaponInstance |
| reload | 完了時のactual loaded消費、partial、Timerのgeneration/instance guard |
| world | 決定的4素材箱、初期world weapon、E取得、native drag and drop |
| role | クォーターマスターだけのworld weapon reload 10%遅延 |

| 対象外 | 理由 |
| --- | --- |
| 専用weapon Actor、DoT、cone、地面炎、矢回収、貫通 | 既存bullet poolとhit経路で試遊範囲を満たす |
| 素材分割、クラフト、永続化、通信同期 | ローカルprototypeの最小範囲外 |
| 設定値の自動balance判定 | 調整は手動試遊で行う |

## 3. 関連ドキュメント

| 種別 | リンク |
| --- | --- |
| 要件 | [REQ-AMMO-MATERIAL-V1](../../20_requirements/ammo-material-v1.md) |
| 仕様 | [SPEC-AMMO-MATERIAL-V1](../../30_specs/ammo-material-v1.md) |
| 基本設計 | [DESIGN-BASIC-AMMO-MATERIAL-V1](../basic/ammo-material-v1.md) |
| 旧補給文書 | [ammo-supply-v1 詳細設計](ammo-supply-v1.md) |
| inventory境界 | [inventory-v1 仕様](../../30_specs/inventory-v1.md) |
| combat境界 | [combat-choice-v1 仕様](../../30_specs/combat-choice-v1.md) |
| lifecycle境界 | [survival-time-limit-v1 仕様](../../30_specs/survival-time-limit-v1.md) |

## 4. 業務ルール

| ルールID | ルール | 根拠 |
| --- | --- | --- |
| BR-001 | 武器枠とworld weaponはid、model、magazine、nextFireAtを持つWeaponInstanceを移動する | REQ-AMMO-MATERIAL-V1 |
| BR-002 | 同modelでもinstance IDが異なれば弾倉、射撃待ち、reloadは共有しない | REQ-AMMO-MATERIAL-V1 |
| BR-003 | reload開始時は素材を減らさず、完了時だけactual loadedに素材消費量を掛けて減らす | SPEC-AMMO-MATERIAL-V1 |
| BR-004 | 旧generation、別instance、停止済みTimerのreload callbackは無作用 | REQ-AMMO-MATERIAL-V1 |
| BR-005 | 4箱は実弾、実弾、投射、特殊セルの循環で決定的に置く | REQ-AMMO-MATERIAL-V1 |
| BR-006 | 連弩は投射マテリアル、火炎放射器は特殊セルからreloadする | REQ-AMMO-MATERIAL-V1 |
| BR-007 | クォーターマスターのworld weapon reloadだけ基準より10%長い | REQ-AMMO-MATERIAL-V1 |

## 5. 利用者導線・操作フロー

~~~mermaid
flowchart TD
  start[run開始またはretry] --> inventory[初期WeaponInstanceと3素材を作成]
  inventory --> pickup[素材箱またはworld itemをE取得]
  pickup --> select[quick slotからinstanceを選択]
  select --> reload{弾倉不足で素材があるか}
  reload -->|yes| pending[instance ID付きreload Timerを開始]
  pending --> complete[同generationかつ同active instanceを確認]
  complete --> consume[actual loaded分だけ素材を消費]
  consume --> fire[既存bullet poolで発射]
  reload -->|no| pickup
  fire --> drop[weaponまたは素材をworldへdrop]
  drop --> pickup
  pending --> terminal[切替、reload対象instanceのworld drop、terminal、retry]
  terminal --> start
~~~

| ステップ | 操作者 | 入力 | システム処理 | 出力 |
| ---:| --- | --- | --- | --- |
| 1 | player | run開始、retry | 初期instance、初期素材、4素材箱、world weaponを作る | HUDに選択武器、弾倉、対応素材を表示 |
| 2 | player | E | 近傍の素材箱またはworld素材itemの全quantityを対応materialへ移す | itemを削除する。素材容量上限・partial pickupは持たず、partialはreload時の装填だけ |
| 3 | player | Rまたは空弾倉発射 | active instance IDをreloadingに記録しTimerを作る | reload進捗を表示 |
| 4 | system | Timer完了 | generation、Timer、active instance、reloading IDを確認する | actual loadedだけ装填・消費し進捗を消す |
| 5 | player | Tab drag and drop | 配置候補確定後にweapon instanceまたは素材をworldへ移す | 後のE取得でも同じweapon状態を使う |

## 6. 状態遷移

~~~mermaid
stateDiagram-v2
  [*] --> ready
  ready --> reloading: active instanceが不足かつ素材が1発分以上
  reloading --> ready: completeReload(instance ID)
  reloading --> ready: switch / reload対象instanceをinventory slotから外すdrop / terminal / retry
  ready --> terminal: victory / defeat
  terminal --> ready: retryCombat
~~~

| 状態 | 意味 | 許可する処理 |
| --- | --- | --- |
| ready | active WeaponInstanceで射撃可能またはreload開始可能 | fire、pickup、drop、reload |
| reloading | 1つのinstance IDだけを待機中 | 有効Timerの完了、取消 |
| terminal | victoryまたはdefeat後 | reload、pickup、drop、fireは無作用。retryだけ許可 |

## 7. データ設計と手動同期

src/ammo-data.ts は AmmoMaterial、AMMO_MATERIALS、WeaponModel、WEAPONS を持つ。src/rules.ts は WeaponInstance、InventoryState、CombatState、createWeaponInstance、startReload、completeReload、dropAmmoMaterial、retryCombat を持つ。これらはTypeScript sourceであり、現在のDOCGEN transformの対象外である。

この詳細設計には自動生成予約や生成ブロックを置かない。public export、型、adapter呼出しはsrc/ammo-data.ts、src/rules.ts、src/main.ts、対象unit、代表E2Eとの差分を手動reviewして同期する。TypeScript public情報を機械同期する必要が生じた場合は、既存範囲を拡張せず [Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31) で判断する。

## 8. adapter設計

| 経路 | 呼び出し元 | 純粋状態 | Phaser/DOM責務 |
| --- | --- | --- | --- |
| 初期化/retry | Arena.reset | retryCombat | generation更新、Timer停止、world/HUD再構築 |
| reload開始 | Arena.reload | startReload | role別durationのTimer、progress表示 |
| reload完了 | Timer callback | completeReload | generationとinstance IDを確認、feedback/HUD更新 |
| weapon切替/reload対象instanceのdrop | quick slot/DnD処理 | cancelReloadまたは移動関数 | 対象Timerを停止、world配置。別slotのweapon dropは継続 |
| 素材drop/pickup | pouch/DnD/E処理 | dropAmmoMaterial/collectMaterial | static group、prompt、全quantity取得とitem削除 |
| 発射 | Arena.tryFire | fireWeapon | poolのtexture、scale、body size、collider、effect |

poolから弾を有効化するたび、setScaleとsetBodySizeを現在武器の設定から明示する。表示scaleを変えた後もbody sizeの入力は非scale frame寸法とし、Arcade Bodyのscale適用を二重計算しない。

## 9. 失敗時動作

| 条件 | 状態・表示 | 回復導線 |
| --- | --- | --- |
| 素材が1発分未満 | reloadを開始せず不足feedback | 素材箱またはworld素材をE取得 |
| partial reload | 装填可能分だけmagazineを増やし素材を消費 | 次の補給後に再reload |
| 配置候補なし | inventory、world、ID sequenceを変更しない | 別位置でdrop |
| weapon切替/reload対象instanceのdrop | 対象reloadを取消し素材と既装填弾を保持。別slotのweapon dropはreloadを継続 | 元instanceを再選択または再取得 |
| terminal/retry | Timerを停止しreloading表示を初期化 | 新generationの初期stateで再開 |
| 旧reload callback | 条件不一致で無作用 | 新runのHUDとstateを維持 |

## 10. テスト観点

| レベル | 観点 | 期待結果 |
| --- | --- | --- |
| unit | 同model個体、partial reload、二重完了、drop/re-pickup、retry | instanceと素材の状態が混ざらない |
| unit | role別duration | クォーターマスターだけが非クォーターマスターより長い |
| E2E | 連弩と火炎放射器 | 対応素材でreloadし、既存bullet経路で発射できる |
| E2E | reload中terminal/retry | 旧callback後も新runの初期magazine、素材、reload HUDが不変 |
| 手動試遊 | 全武器の数値、素材量、火炎表示と当たり判定 | 設定変更で体感を確認し、値固定testは作らない |

## 11. 変更履歴

| 日付 | 変更内容 | 理由 |
| --- | --- | --- |
| 2026-08-17 | 初版作成 | Issue #77の試遊確認後のマテリアル・個別武器設計を正本化 |
