---
id: SPEC-GUNSLINGER
requirements: REQ-GUNSLINGER
---

# gunslinger-v1 仕様

## 調整データと純粋関数

`src/player-data.ts` は `GUNSLINGER_BOOT_KNIFE_DAMAGE=2`、`GUNSLINGER_COMBO_PER_EVENT=1`、`GUNSLINGER_SPEED_MULTIPLIER=1.2`、`GUNSLINGER_SPEED_BUFF_DURATION_MS=3000` を公開する。

- `gunslingerComboAfterEvent(combo)` は `combo + GUNSLINGER_COMBO_PER_EVENT` を返す。
- `gunslingerSpeedBuffUntil(now)` は `now + GUNSLINGER_SPEED_BUFF_DURATION_MS` を返す。
- `gunslingerSpeedMultiplierAt(now, speedBuffUntil)` は `now < speedBuffUntil` の間だけ `GUNSLINGER_SPEED_MULTIPLIER`、期限ちょうど以降は `1` を返す。

これらの値は仮調整値であり、実戦バランスの見直しは [Issue #68](https://github.com/WFrog2511/2d-coop-survival/issues/68) の後続sliceへ分離する。

## Arena経路

- `Arena` は `PlayerRole.id === 'gunslinger'` かつ `playerDash` が存在する player-enemy overlap だけをブーツナイフへ分岐する。ほかの役職と非回避時は既存の `hitPlayer` 経路を使う。
- ブーツナイフは dash 開始時に空にする `Set<EnemyInstanceId>` を参照し、同じIDは同一dashで再処理しない。対象は既存の `damageEnemy`、敵 hit-stop、`ArenaEffects`、`scheduleDefeatedEnemy` を使い、通常射撃と同じ撃破／再出現経路へ入る。
- `scheduleDefeatedEnemy` はガンスリンガーの敵撃破ごとにコンボを1加算する。ブーツナイフの成功は撃破とは別にコンボを1加算し、速度buff期限を現在時刻から3000msへ更新する。
- 通常移動の既存210px/sだけに現在の速度倍率を掛ける。回避速度、hit-stop、terminal停止は変更しない。
- `reset` と `enterTerminal` はコンボ、速度buff期限、処理済みID Set を初期化する。`retry` は `reset` を通るため同じ初期化を行う。

## HUDと検証契約

- `ArenaHud` は `data-testid="gunslinger-combo"` にコンボを設定し、`data-active="true"` と `data-speed-multiplier="1.2"` をガンスリンガーの有効状態として設定する。非ガンスリンガーでは親表示を hidden にする。
- `tests/player-data.test.ts` はコンボ値、buff期限、期限直前・期限ちょうどの倍率を確認する。
- `e2e/prototype.spec.ts` はガンスリンガーを選択し、通常の敵撃破でコンボが増えること、回避で基本敵のHPが一度だけ2減ること、通過成功でコンボと `data-speed-multiplier` が更新されることを確認する。

本仕様はTypeScript実装と手動で同期する。現行DOCGENはPython sourceだけを対象とするため、DOCGEN検査のPASSをTypeScript同期のPASSへ読み替えない。
