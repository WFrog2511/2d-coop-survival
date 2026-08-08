---
id: DESIGN-BASIC-DIRECTIONAL-SPAWN
requirements: REQ-DIRECTIONAL-SPAWN
specification: SPEC-DIRECTIONAL-SPAWN
---

# directional-spawn-v1 基本設計

## 目的と境界

60秒ごとに決定的に切り替わる主方向とその反対方向を、初期spawnとrespawnへ適用し、既存の3分間生存ループへ位置取りの判断を追加する。

- 合意済み要件は[REQ-DIRECTIONAL-SPAWN](../../20_requirements/directional-spawn-v1.md)を参照する。
- 検証可能な仕様は[SPEC-DIRECTIONAL-SPAWN](../../30_specs/directional-spawn-v1.md)を参照する。
- Definition of Deliveryは[Issue #22 comment 5222574276](https://github.com/WFrog2511/2d-coop-survival/issues/22#issuecomment-5222574276)を正本とする。
- 敵循環・balance・HUDは[Issue #38](https://github.com/WFrog2511/2d-coop-survival/issues/38)のfollow-upを適用する。
- 既存のmap生成、enemy visibility、有限弾薬、3分勝利、弾薬箱respawnを維持し、方向付きspawnに必要な差分だけを加える。

## 責務

| 対象 | 責務 |
| --- | --- |
| `src/rules.ts` | 12 stable ID、基本敵HP4、ドローンHP2・耐性なし、retry state |
| `src/arena-map.ts` | phase/方向、enemy専用strict selector、death/recycle delay、role、deterministic BFS tie-break |
| `src/main.ts` | 初期8体、段階投入、death/recycle/retry TimerEvent、flank/separation、terminal、HUD/data属性、DEV hook |
| `index.html` / `style.css` | 上中央timer、左下HP数値/bar、右下ammoと診断HUD |
| `tests/arena-map.test.ts` / `tests/rules.test.ts` | phase、方向、12 slot、候補選択、敵stateのunit期待値 |
| `e2e/prototype.spec.ts` | phase境界、active enemy非再配置、新phase respawn、retry、HUD/data属性、既存利用経路のE2E期待値 |

## 処理フロー

~~~mermaid
flowchart TD
  reset["run開始またはretry"] --> generation["generation更新・startedAt設定"]
  generation --> map["map・player・弾薬箱を構築"]
  map --> initial["初期8体をstrict hidden spawn"]
  initial --> stagger["3/6/9/12秒で4体を段階投入"]
  stagger --> playing["stable 12体でplaying"]
  playing --> hud["現在時刻からphaseと主方向をHUD更新"]
  hud --> boundary{"60秒境界か"}
  boundary -->|yes| keep["active enemyは位置とmetadataを維持"]
  boundary -->|no| playing
  keep --> playing
  playing --> defeated{"enemy撃破か"}
  defeated -->|yes| timer["death TimerEvent"]
  timer --> guard{"同じgenerationかつplayingか"}
  guard -->|yes| spawn["spawnEnemyでcurrent phaseを適用"]
  guard -->|no| discard["副作用なしで終了"]
  spawn --> playing
  playing --> terminal{"victoryまたはdefeatか"}
  terminal -->|yes| stop["run timer停止・物理pause"]
  stop --> retry["retry"]
  retry --> reset
~~~

## phase state

resetはrun generationを更新し、初期8 IDをphase 0のstrict spawn対象、残り4 IDを3000/6000/9000/12000msのstagger対象として構築する。candidateなしは1000ms retryする。

playing中は`floor(max(0, now - startedAt) / 60000)`でcurrent phaseを求める。60秒境界で定期的に変更するのはphaseと主方向のHUDだけであり、active enemyのstateやspriteを更新しない。初期spawnまたはrespawnで`spawnEnemy`を実行する時だけ、その時点のcurrent phaseを適用する。

victory/defeat/retryはstagger、retry、death、recycleを含む全enemy TimerEventとrecycle lockを停止し、旧generation callbackを無効化する。

## 12 stable slotと9対3の割り当て

stable slotは`basic-1`〜`basic-9`、`drone-1`〜`drone-3`の順で0始まりindexを持つ。`index % 4 === 3`の3 slotだけを主方向の反対方向へ割り当て、残り9 slotを主方向へ割り当てる。

主方向とstable slot順は維持する。Issue #38では基本敵HP4、ドローンHP2・小口径耐性なし、death delay基本5000〜9000ms/ドローン3000〜6000msへ更新する。

## enemy candidate選択と循環

`spawnEnemy`はplayer、actual camera viewport、occupied、割り当て方向をenemy専用`selectEnemySpawnTile`へ渡し、offscreen、hidden、reachable、unoccupied、direction一致をすべて必須とする。弾薬箱用`selectSpawnTile`の既存fallbackは変更しない。

1. playerから到達可能でoccupiedではないfloorをcandidateとする。
2. actual viewport外、hidden、requested direction一致を必須にする。
3. strict pool内をseedの剰余indexで決定的に選ぶ。

enemy candidateがなければ`null`を返し、inactive/hiddenのまま同じreasonで1000ms retryする。方向変更またはvisible fallbackは行わない。

deathは成功後だけ全HP、recycleはHPを保持する。recycle条件はhidden 8000〜12000ms、被弾なし3000ms、path 10 edge以上、同時1体で、2000〜4000ms後にre-entryする。基本敵はdirect/left/right各3体、stable tie-break、1 tile内の分離を使い、ドローンは高速直接追跡を維持する。

## active enemyを再配置しない境界

phaseは次回spawnの入力であり、active enemyへ適用する命令ではない。phase境界ではenemy spriteの位置、velocity、path、HP、visibility、stable ID、spawn metadataを変更しない。これにより画面内の敵が突然移動することを防ぎ、既存戦闘と索敵の連続性を保つ。

撃破後の通常respawnだけがcurrent phaseで新しいtileとmetadataを得る。他のactive enemyは以前のspawn phaseと位置を保持する。

## DEV hookとproduction境界

`debugRespawnEnemy(enemyId)`はphase境界後のrespawnを時間依存の戦闘操作なしで観測するE2E専用hookとする。DEV環境でだけ`window.__arenaScene`を公開し、hookは既存`spawnEnemy`を再利用する。

productionではSceneとhookを`window`へ公開しない。DEV hookを利用者向けAPI、通常のrespawn経路、productionの操作手段にしない。未知のID、inactive enemy、terminal中の呼出しを拒否する。

## 失敗時動作

- 初期、stagger、death、recycleでcandidateを確保できない場合は1000ms retryし、可視位置へ強制spawnしない。
- deathはstrict spawn成功までCombatStateを復活させず、recycleはCombatState HPを変更しない。
- DEV hookの再出現が失敗した場合はrespawn count、元位置、spawn metadata、body、visibilityを直前状態へ戻して例外にする。
- respawn callbackは登録時generationとcurrent generationを比較し、不一致またはterminalなら副作用なしで終了する。
- occupied判定によりplayer、activeな弾薬箱、他のactive enemyと同じtileへ重複生成しない。

## 既存sliceの回帰境界

- Issue #20: LOSとnormal/boundary/hidden表示は維持し、別recycle policyがhidden結果だけを参照する。
- Issue #21: 有限弾薬、武器切替、射撃、リロード、ammo panel、弾薬箱4個を維持する。activeな弾薬箱をenemy spawnのoccupiedに含める。
- Issue #34: 180000ms生存勝利、victory/defeatのterminal停止、retry、30000ms後の弾薬箱respawnを維持する。敵phaseは同じ`startedAt`を使い、弾薬箱respawnもactive enemyとの非重複を維持する。

## Ponytail方針と再検討条件

既存CombatState、enemy ID、Phaser TimerEvent、generation、DOM HUDを再利用する。enemy strict selectorと小さなpure helperだけを追加し、新規依存、wave director、汎用strategyは追加しない。

敵種・方向比率・phase規則を複数の承認済みsliceから個別設定する必要が生じた場合、固定12体を超える負荷で計測済みの性能問題が出た場合、またはmultiplayer同期にserver authorityが必要になった場合に限り、設定化、cache、wave director、同期境界を別Issueで再検討する。

## TypeScript同期

本基本設計は`src/rules.ts`、`src/arena-map.ts`、`src/main.ts`、`index.html`、`style.css`、unit/E2E差分と手動で同期する。現行DOCGEN transformはPython sourceだけを対象とするため、このsliceではTypeScript用transformを追加せず、DOCGEN検査のPASSをTypeScript設計同期のPASSへ読み替えない。
