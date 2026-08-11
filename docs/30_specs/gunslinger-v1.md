---
id: SPEC-GUNSLINGER
requirements: REQ-GUNSLINGER
---

# gunslinger-v1 仕様

## 調整データと純粋関数

`src/player-data.ts` は `GUNSLINGER_BOOT_KNIFE_DAMAGE=2`、`GUNSLINGER_COMBO_PER_EVENT=1`、`GUNSLINGER_SPEED_MULTIPLIER=1.2`、`GUNSLINGER_SPEED_BUFF_DURATION_MS=3000`、`GUNSLINGER_COMBO_TIMEOUT_MS=3000`、`PLAYER_DASH_DISTANCE_PX=80`、`GUNSLINGER_DASH_DISTANCE_PX=120`、`PLAYER_DASH_COOLDOWN_MS=667`、`GUNSLINGER_DASH_COOLDOWN_MS=400` を公開する。

- `gunslingerComboAfterEvent(combo)` は `combo + GUNSLINGER_COMBO_PER_EVENT` を返す。
- `gunslingerSpeedBuffUntil(now)` は `now + GUNSLINGER_SPEED_BUFF_DURATION_MS` を返す。
- `gunslingerSpeedMultiplierAt(now, speedBuffUntil)` は `now < speedBuffUntil` の間だけ `GUNSLINGER_SPEED_MULTIPLIER`、期限ちょうど以降は `1` を返す。
- `dashDistanceFor(roleId)` はガンスリンガーだけ120px、ほかの役職は80pxを返す。`dashSpeedFor(roleId)` は既存160msの回避時間からそれぞれ750px/s、500px/sを返す。
- `dashCooldownUntil(now, roleId)` はガンスリンガーへ400ms、ほかの役職へ667msのcooldownを加えた期限を返す。
- `canFireWhileDashing(roleId)` はガンスリンガーだけ`true`を返す。

これらの値は仮調整値であり、実戦バランスの見直しは [Issue #68](https://github.com/WFrog2511/2d-coop-survival/issues/68) の後続sliceへ分離する。

## Arena経路

- `Arena` は `PlayerRole.id === 'gunslinger'` かつ `playerDash` が存在する player-enemy overlap だけをブーツナイフへ分岐する。ほかの役職と非回避時は既存の `hitPlayer` 経路を使う。
- ブーツナイフは dash 開始時に空にする `Set<EnemyInstanceId>` を参照し、同じIDは同一dashで再処理しない。対象は既存の `damageEnemy`、敵 hit-stop、`ArenaEffects`、`scheduleDefeatedEnemy` を使い、通常射撃と同じ撃破／再出現経路へ入る。
- `scheduleDefeatedEnemy` はガンスリンガーの敵撃破ごとにコンボを1加算する。ブーツナイフの成功は撃破とは別にコンボを1加算し、速度buff期限を現在時刻から3000msへ更新する。
- `gunslingerComboExpiresAt` は初期値0の内部stateとする。通常弾の `hitEnemy`、ブーツナイフの `bootKnifeEnemy`、DEVの `debugDamageEnemy` は、敵HPが実際に減ったときだけガンスリンガーの期限を `now + GUNSLINGER_COMBO_TIMEOUT_MS` へ更新する。
- 毎frameのHUD更新前に `now >= gunslingerComboExpiresAt` を判定し、期限到達時はコンボと期限だけを0へ戻す。速度buff期限は変更しない。`hitPlayer` は既存の無敵・terminal・接触cooldownの早期return後、実際にプレイヤーHPが減ったときだけ同じコンボresetを行う。
- `tryDash` は開始時と回避中の速度に `dashSpeedFor(PlayerRole.id)` を使い、`dashCooldownUntil(this.time.now, PlayerRole.id)`で役職別cooldownを設定する。ガンスリンガーは120pxを160msで移動し、400msのcooldownを使う。ほかの役職は既存80pxを160msで移動し、667msのcooldownを使う。hit-stop、terminal停止は変更しない。
- `tryFire` は非ガンスリンガーの回避中に早期returnし、弾丸・弾薬・リロード状態を変更しない。ガンスリンガーは回避中も既存の武器規則で発砲できる。通常移動の既存210px/sだけに速度buffを掛け、回避速度へは掛けない。
- `resetGunslingerState`、`reset`、`enterTerminal` はコンボ、コンボ期限、速度buff期限、処理済みID Set を初期化する。`retry` は `reset` を通るため同じ初期化を行う。

## HUDと検証契約

- `ArenaHud` は `data-testid="gunslinger-combo"` にコンボを設定し、`data-active="true"` と `data-speed-multiplier="1.2"` をガンスリンガーの有効状態として設定する。非ガンスリンガーでは親表示を hidden にする。
- `tests/player-data.test.ts` は任意deadlineの境界、役職別のdash中発砲可否、コンボと速度buffの状態遷移を確認する。
- `e2e/prototype.spec.ts` はガンスリンガーを選択したときcombo panelがvisibleになり値が更新されること、敵HPを減らした命中で期限が更新されること、最新期限到達と実被弾でコンボがresetされること、無敵と接触cooldown中は維持されること、terminal / retryでresetされること、通常の敵撃破でコンボが増えること、回避で基本敵のHPとHUD状態が一回だけ変化すること、役職別のdash中発砲可否を確認する。
- 距離、速度、cooldown、ダメージ、コンボ加算量、コンボ継続時間、速度倍率、buff継続時間の調整値そのものは自動assertせず手動確認する。

本仕様はTypeScript実装と手動で同期する。現行DOCGENはPython sourceだけを対象とするため、DOCGEN検査のPASSをTypeScript同期のPASSへ読み替えない。
