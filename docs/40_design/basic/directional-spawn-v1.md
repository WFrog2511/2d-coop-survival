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
- 既存のmap生成、enemy visibility、有限弾薬、3分勝利、弾薬箱respawnを維持し、方向付きspawnに必要な差分だけを加える。

## 責務

| 対象 | 責務 |
| --- | --- |
| `src/rules.ts` | `basic-1`〜`basic-9`、`drone-1`〜`drone-3`の12 stable ID、既存の敵種別・HPを持つCombatState、retry時の初期state |
| `src/arena-map.ts` | 60秒phase、map seedとphaseによる主方向、stable slotの割り当て方向、player基準方向判定、方向付き`selectSpawnTile`を副作用のない関数として提供 |
| `src/main.ts` | Phaser Sceneのrun時刻・generation・enemy sprite、初期spawn/respawn、terminal/retry、HUD/data属性同期、DEV hookを管理 |
| `index.html` / `style.css` | 出現phase、主方向、敵12体のHPとspawn metadataを観測できるDOM HUDと表示layout |
| `tests/arena-map.test.ts` / `tests/rules.test.ts` | phase、方向、12 slot、候補選択、敵stateのunit期待値 |
| `e2e/prototype.spec.ts` | phase境界、active enemy非再配置、新phase respawn、retry、HUD/data属性、既存利用経路のE2E期待値 |

## 処理フロー

~~~mermaid
flowchart TD
  reset["run開始またはretry"] --> generation["generation更新・startedAt設定"]
  generation --> map["map・player・弾薬箱を構築"]
  map --> initial["12 stable slotをphase 0でspawn"]
  initial --> playing["playing"]
  playing --> hud["現在時刻からphaseと主方向をHUD更新"]
  hud --> boundary{"60秒境界か"}
  boundary -->|yes| keep["active enemyは位置とmetadataを維持"]
  boundary -->|no| playing
  keep --> playing
  playing --> defeated{"enemy撃破か"}
  defeated -->|yes| timer["既存respawn TimerEvent"]
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

resetはrun generationを更新し、`startedAt`を現在のScene時刻へ設定する。初期12体はphase 0としてspawnし、HUDには表示値1と0始まりの`data-phase="0"`を出す。

playing中は`floor(max(0, now - startedAt) / 60000)`でcurrent phaseを求める。60秒境界で定期的に変更するのはphaseと主方向のHUDだけであり、active enemyのstateやspriteを更新しない。初期spawnまたはrespawnで`spawnEnemy`を実行する時だけ、その時点のcurrent phaseを適用する。

victoryまたはdefeatでは敵respawnを含むrun timerを停止し、terminal後のspawnを許可しない。retryは旧generationを無効化してtimer、map、state、sprite、HUDを初期化し、新runをphase 0から開始する。

## 12 stable slotと9対3の割り当て

stable slotは`basic-1`〜`basic-9`、`drone-1`〜`drone-3`の順で0始まりindexを持つ。`index % 4 === 3`の3 slotだけを主方向の反対方向へ割り当て、残り9 slotを主方向へ割り当てる。

主方向は`up`、`right`、`down`、`left`の固定配列をmap seedとphaseで循環させる。反対方向は同配列で2つ先とする。stable slotの順序をrun中に変えず、enemy ID、種別、HP、速度、接触damage、respawn delayの既存契約を維持する。

## candidate選択とfallback

`spawnEnemy`はspawn時点のplayer tile、camera viewport、activeな弾薬箱、対象以外のactive enemyを既存`selectSpawnTile`へ渡す。selectorは次の順で候補を選ぶ。

1. playerから到達可能でoccupiedではないfloorをcandidateとする。
2. viewport外候補を優先する。
3. requested directionとplayer基準方向が一致する候補を優先する。
4. viewportとのgapが6 tile以下の候補があればそのpoolを使う。
5. pool内をseedの剰余indexで決定的に選ぶ。

指定方向のviewport外候補がない場合は、方向を問わない既存viewport外poolへfallbackする。viewport外候補がない場合は、全candidateからplayerとのManhattan距離が最遠のfloorへfallbackする。candidate自体がなければ`null`を返す。

## active enemyを再配置しない境界

phaseは次回spawnの入力であり、active enemyへ適用する命令ではない。phase境界ではenemy spriteの位置、velocity、path、HP、visibility、stable ID、spawn metadataを変更しない。これにより画面内の敵が突然移動することを防ぎ、既存戦闘と索敵の連続性を保つ。

撃破後の通常respawnだけがcurrent phaseで新しいtileとmetadataを得る。他のactive enemyは以前のspawn phaseと位置を保持する。

## DEV hookとproduction境界

`debugRespawnEnemy(enemyId)`はphase境界後のrespawnを時間依存の戦闘操作なしで観測するE2E専用hookとする。DEV環境でだけ`window.__arenaScene`を公開し、hookは既存`spawnEnemy`を再利用する。

productionではSceneとhookを`window`へ公開しない。DEV hookを利用者向けAPI、通常のrespawn経路、productionの操作手段にしない。未知のID、inactive enemy、terminal中の呼出しを拒否する。

## 失敗時動作

- 初期12体のいずれかにcandidateを確保できない場合は、必要なrun初期状態を構築できないため例外にする。
- 通常respawnでcandidateがない場合はenemyをinactiveかつ非表示のままにし、CombatStateを復活させず、HUDへ再出現位置がないことを表示する。
- DEV hookの再出現が失敗した場合はrespawn count、元位置、spawn metadata、body、visibilityを直前状態へ戻して例外にする。
- respawn callbackは登録時generationとcurrent generationを比較し、不一致またはterminalなら副作用なしで終了する。
- occupied判定によりplayer、activeな弾薬箱、他のactive enemyと同じtileへ重複生成しない。

## 既存sliceの回帰境界

- Issue #20: enemy visibilityのnormal、boundary silhouette、hidden、暗転maskと更新契約を維持する。敵数・spawn位置への対応以外へvisibilityロジックを広げない。
- Issue #21: 有限弾薬、武器切替、射撃、リロード、ammo panel、弾薬箱4個を維持する。activeな弾薬箱をenemy spawnのoccupiedに含める。
- Issue #34: 180000ms生存勝利、victory/defeatのterminal停止、retry、30000ms後の弾薬箱respawnを維持する。敵phaseは同じ`startedAt`を使い、弾薬箱respawnもactive enemyとの非重複を維持する。

## Ponytail方針と再検討条件

既存のCombatState、enemy ID配列、map helper、`selectSpawnTile`、Phaser Scene/TimerEvent、run generation、respawn Map、DOM HUDを再利用する。phaseと方向は小さなpure function、Scene側は既存`spawnEnemy`への入力追加に留める。新規依存、wave director、汎用strategy、可変比率設定、将来用の抽象化は追加しない。

敵種・方向比率・phase規則を複数の承認済みsliceから個別設定する必要が生じた場合、固定12体を超える負荷で計測済みの性能問題が出た場合、またはmultiplayer同期にserver authorityが必要になった場合に限り、設定化、cache、wave director、同期境界を別Issueで再検討する。

## TypeScript同期

本基本設計は`src/rules.ts`、`src/arena-map.ts`、`src/main.ts`、`index.html`、`style.css`、unit/E2E差分と手動で同期する。現行DOCGEN transformはPython sourceだけを対象とするため、このsliceではTypeScript用transformを追加せず、DOCGEN検査のPASSをTypeScript設計同期のPASSへ読み替えない。
