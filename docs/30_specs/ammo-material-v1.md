---
id: SPEC-AMMO-MATERIAL-V1
requirements: REQ-AMMO-MATERIAL-V1
---

# ammo-material-v1 仕様

## 素材と武器設定

AmmoMaterial は ballistic-material、projectile-material、special-cell のいずれかとする。利用者表示は順に 実弾マテリアル、投射マテリアル、特殊セル とする。素材の初期量、箱量、色、icon は src/ammo-data.ts の AMMO_MATERIALS を唯一の設定とし、HUD、world item、ポーチはその設定を読む。

WeaponModel は rifle、shotgun、handgun、revolver、compact-pistol、repeating-crossbow、flamethrower の7種類とする。src/ammo-data.ts の WEAPONS は各modelの素材、1発当たり素材消費量、自動射撃、弾倉、reload、bullet、色、表示・当たり判定倍率を一か所で定める。

| 武器群 | 消費素材 | 発射規則 | 簡略化境界 |
| --- | --- | --- | --- |
| rifle、shotgun、handgun、revolver、compact-pistol | 実弾マテリアル | 既存bullet poolによる銃器射撃 | 既存のhit、range、effectを維持 |
| repeating-crossbow | 投射マテリアル | 自動の単発投射 | 専用Actor、矢回収、貫通なし |
| flamethrower | 特殊セル | 自動の短射程離散弾 | DoT、cone、地面炎なし |

火炎放射器を発射するときは、poolから有効化した弾の表示scaleとArcade Bodyの寸法を同じ武器設定で決める。他modelの発射でも毎回scaleとbody sizeを設定するため、pool中の火炎放射器設定は漏れない。body sizeの入力は非scale frame寸法を使い、displayWidthやdisplayHeightを二重適用しない。

## 個別武器状態

WeaponInstance は id、model、magazine、nextFireAt を持つ。CombatState.inventory のquickSlotsとbackpackSlotsは WeaponInstance またはnullを保持する。active weaponはselectedQuickSlotのinstanceであり、同じmodelでもinstance IDが異なれば弾倉、nextFireAt、reload対象も独立する。

world weapon itemはWeaponInstanceをそのまま保持する。collectWeaponは同じinstanceを空きslotへ移し、world dropは配置候補の確定後に同じinstanceをworldへ移す。drop、pickup、slot移動、swapはmagazineとnextFireAtを再初期化しない。retryCombatだけは初期WeaponInstanceを新しく作る。

## reload状態遷移

CombatState.reloading は進行中のWeaponInstance IDまたはnullとする。

~~~text
通常 --素材が1発分以上あり、弾倉不足--> reload中
reload中 --Timer完了、同generation、同instanceがactive--> 通常（actual loaded分だけ素材を消費）
reload中 --切替、reload対象instanceをinventory slotから外すdrop、terminal、retry--> 通常（Timerを停止、素材と弾倉を変更しない）
通常 --素材不足、満タン、terminal、別reload中--> 通常（無作用）
~~~

startReloadはactive instance、弾倉不足、素材が最低1発分、非terminal、reloading=nullを確認してIDを記録する。Timer callbackはtimer identity、run generation、terminal、reloading ID、active instance IDをすべて確認する。

completeReloadは不足弾数と floor(materialQuantity / materialCostPerShot) の小さい方をactual loadedとする。actual loadedが正の場合だけ magazine を増やし、materialQuantityから actual loaded × materialCostPerShot を引く。素材不足で0発の場合はreloadingだけを解除する。開始時、取消時、古いcallbackでは素材を消費しない。

## world素材、ポーチ、取得

4個のstable素材箱はAMMO_MATERIAL_BOX_CYCLEに従い、実弾マテリアル、実弾マテリアル、投射マテリアル、特殊セルの順を決定的に配置する。各箱はboxId、material、quantity、worldColor、textureを持つ。E取得は箱またはworld素材itemの全quantityを所持へ移し、取得したitemを削除する。partialはreload時の装填だけであり、素材容量上限またはpartial pickupは持たない。空になったstable boxだけ既存のbox respawn規則で同じ素材と設定済み数量へ復活する。

ammo-pouchは3素材の現在量を表示する。pouch行をgame領域へdropすると、world配置候補を先に決め、成功時だけ設定済み箱量以下の素材をAmmoMaterial world itemとして移す。候補不足または素材0ではinventory、world item、ID sequenceを変えない。E取得は選択された素材箱またはworld素材itemの全quantityを対応materialへ移し、itemを削除する。

## role、terminal、retry

reloadDurationForWorldWeaponは正の基準reload時間を正規化し、クォーターマスターだけ基準時間へ1.1のduration multiplierを掛ける。ほかのroleは同じ基準時間を使う。

Arena.resetはgenerationを先に増やし、reload Timerを含むrun timerを停止してからretryCombatを作る。weapon切替または進行中reload対象instanceをinventory slotから外すworld dropではreload Timerを停止する。別slotのweapon dropは進行中reloadを継続する。old callbackは新runまたは別instanceへ素材、magazine、HUD feedbackを適用しない。terminalはreload表示を待機へ戻し、retryは新しい初期WeaponInstance、初期素材、world素材箱、HUDを構築する。

## 検証契約

- rules unitは個体独立、partial reload、完了時だけの消費、重複完了の無作用、drop/re-pickup保持、retryの独立初期化を確認する。
- player-data unitはクォーターマスターが他roleより長いduration、非クォーターマスターの同値、無効入力の正規化を確認する。
- Playwrightは連弩と火炎放射器の対応素材reload/発射と、reload中にterminal/retryした旧callbackが新runの初期弾倉、素材、HUDを変えない経路を確認する。
- 調整用の数値そのものはtestで固定しない。設定変更後の妥当性は手動試遊で確認する。
