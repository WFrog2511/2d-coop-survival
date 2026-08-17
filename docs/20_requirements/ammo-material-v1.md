---
id: REQ-AMMO-MATERIAL-V1
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/77#issuecomment-5315660037
implementation_task: https://github.com/WFrog2511/2d-coop-survival/issues/77
condition_change: https://github.com/WFrog2511/2d-coop-survival/issues/77#issuecomment-5315769565
---

# ammo-material-v1 要件

## 目的とDefinition of Delivery

[Issue #77](https://github.com/WFrog2511/2d-coop-survival/issues/77) の Prototype standard・試遊優先モードで、旧 AmmoType、weapon 別 reserve、共有弾倉の表現を、3種類のマテリアルと個別武器へ移行する。試遊確認後の方向性として、ローカル Phaser/Vite browser prototype で補給、個別弾倉、world pickup、drag and drop、reload、terminal/retry を一続きで遊べることを必須とする。通信、永続化、外部サービス、新規依存は使わない。

## 合意済み要件

- 弾薬素材は 実弾マテリアル、投射マテリアル、特殊セル の3種類とし、所持、補給箱、world item、ポーチ、HUDで同じ素材識別子を使う。表示の英字 Material は使わない。
- 武器モデルは rifle、shotgun、handgun、revolver、compact-pistol、repeating-crossbow、flamethrower の7種類とする。既存5銃器は実弾マテリアル、連弩は投射マテリアル、火炎放射器は特殊セルを消費する。
- 所持武器とworld weaponは、id、model、magazine、nextFireAt を持つ WeaponInstance とする。同じmodelを複数持っても弾倉、射撃待ち、reloadは個別である。worldへ落とし、再取得した武器は同じinstanceと装填済み弾数を保持する。
- reload開始は素材を消費しない。完了時だけ、実際に装填した弾数と武器ごとの素材消費量から消費量を求める。素材不足では装填可能な分だけ装填し、すでに装填済みの弾を返却しない。重複または古い完了callbackは二重消費しない。
- 通常worldには決定的に配置する4個の素材箱を置く。循環は実弾マテリアル2箱、投射マテリアル1箱、特殊セル1箱とし、3種類すべてを補給、ポーチ表示、E取得、worldへのdrag and drop、再取得へ接続する。
- 初期world weaponには連弩と火炎放射器を含める。連弩は自動投射、火炎放射器は短射程の自動離散弾で既存bullet pool、collider、range、hit effectを再利用する。専用Actor、DoT、cone、地面炎、矢回収、貫通は追加しない。
- 火炎放射器の弾は視覚と物理当たり判定を設定済み倍率で同時に拡大し、次にpoolを使う他武器は通常倍率へ戻す。画面表示と物理の倍率は武器設定から導出する。
- クォーターマスターだけはworld weaponのreload待機時間を他roleより10%長くする。補給、素材量、射撃待ち、通常の初期武器へ役職差を広げない。
- 武器切替、進行中reload対象instanceをinventory slotから外すworld drop、terminal、retryではreload Timerを停止する。別slotのweapon dropでは進行中reloadを継続する。callbackはrun generationとWeaponInstance IDを確認し、旧runまたは別instanceのcallbackが新しい状態、素材、HUDを変更しない。
- HUD、texture、effect、quickbar、詳細inventory、ポーチ、pickup feedbackは7武器と3素材を読める表示にする。調整値は一か所の設定から読み、damage、speed、range、cooldown、capacity、数量、色、倍率の妥当性は手動試遊で確認する。

## 受け入れ条件

1. 同じmodelを複数所持した場合も、発射、reload、切替、world drop/re-pickupの後に各 WeaponInstance の弾倉と射撃待ちが混ざらない。
2. reload完了時だけ素材が減り、partial reloadは素材で可能な発数だけ装填する。同じ完了要求を重ねても素材を二重消費しない。
3. 3種類の素材箱、ポーチ、E取得、world drop/re-pickupが対応素材の残量を一貫して更新する。
4. 連弩と火炎放射器が対応素材からreload後に発射できる。火炎放射器のpool再利用後も他武器の弾表示・当たり判定は通常倍率である。
5. terminal/retryの後、旧reload callbackは新runの初期WeaponInstanceの弾倉、素材、reload HUDを変更しない。
6. クォーターマスターのworld weapon reload待機は他roleより長く、非クォーターマスター間では同じ基準時間を使う。

## 対象外と手動確認

武器固有のDoT、cone、地面炎、矢の回収、貫通、弾薬クラフト、素材stack分割、汎用loot基盤、永続化、通信同期、新規依存は対象外とする。設定内の調整値そのもの、武器の体感、火炎放射器の見た目と当たり判定の大きさはプロジェクトオーナーの手動試遊で調整し、値を固定するunit testは追加しない。

## 旧文書との関係

本要件が ammo-supply-v1 全体を supersede する。inventory-v1 と combat-choice-v1 は武器枠、drag and drop、移動、敵、壁、入力などの既存範囲を維持し、旧WeaponModel、WeaponId、AmmoType、shared ammo、reserve、旧reload表現だけを限定的に supersede する。survival-time-limit-v1 はtimer、generation、terminal、retry、box respawnの機構を維持し、旧ammo表現だけを本要件へ読み替える。
