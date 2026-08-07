---
id: SPEC-DIRECTIONAL-SPAWN
requirements: REQ-DIRECTIONAL-SPAWN
---

# directional-spawn-v1 仕様

## 正本と同期範囲

- Definition of Deliveryは[Issue #22 comment 5222574276](https://github.com/WFrog2511/2d-coop-survival/issues/22#issuecomment-5222574276)を正本とする。
- 合意済み要件は[REQ-DIRECTIONAL-SPAWN](../20_requirements/directional-spawn-v1.md)を参照する。
- 本仕様はTypeScript実装と手動で同期する。現行DOCGENはPython sourceだけを対象とするため、DOCGEN検査のPASSを本仕様とTypeScriptの同期確認へ読み替えない。

## phaseと主方向

run開始時刻を`startedAt`、現在のゲーム時刻を`now`とし、0始まりのphaseを次で求める。

~~~text
phase = floor(max(0, now - startedAt) / 60000)
~~~

`now <= startedAt`とrun開始直後はphase 0、`startedAt + 60000`の境界でphase 1とする。HUDの表示値は`phase + 1`とする。

方向の順序は`up`、`right`、`down`、`left`で固定する。主方向はmap seedをunsigned 32-bit値として扱い、`(seed + phase) % 4`に対応する方向を選ぶ。同じmap seedとphaseは常に同じ主方向となり、連続する4 phaseで4方向を決定的に一巡する。

## stable slotと敵構成

敵のstable slotは次の順序の0始まりindexとする。

1. `basic-1`から`basic-9`
2. `drone-1`から`drone-3`

`index % 4 === 3`のslotだけを主方向の反対方向へ割り当て、それ以外を主方向へ割り当てる。12 slotでは主方向9体、反対方向3体となり、他の2方向は使用しない。反対方向は方向順序上で主方向から2つ先とする。

基本敵は既存値のHP 6、速度68、playerへの接触damage 8を維持する。高速ドローンは既存値のHP 4、速度150、playerへの接触damage 6を維持する。既存の攻撃間隔、被弾倍率、移動、visibility、respawn delayも変更しない。

## player基準の方向判定

spawn時点のplayer tileを`player`、候補tileを`target`とし、`dx = target.x - player.x`、`dy = target.y - player.y`を求める。

- `abs(dx) > abs(dy)`なら水平方向とし、`dx > 0`は`right`、それ以外は`left`とする。
- それ以外は垂直方向とし、`dy > 0`は`down`、それ以外は`up`とする。
- 水平差と垂直差が同じ場合は垂直方向を採用する。

## spawn tile選択

`selectSpawnTile`は次の順で候補を絞り込む。

1. map内のfloor tileから、spawn時点のplayer tileへ到達可能で、`occupied`に含まれないcandidateを作る。
2. candidateのうち現在のcamera viewport外にあるtileを抽出する。
3. requested directionがある場合、viewport外候補からplayer基準の方向が一致するtileを抽出する。
4. 方向一致候補がある場合はそれを使い、ない場合は方向を問わない既存のviewport外候補へfallbackする。
5. 選択中のviewport外poolからviewportとのgapが6 tile以下の候補を抽出し、1件以上あれば近傍poolを使う。なければ元のviewport外poolを使う。
6. poolの順序を維持し、`seed >>> 0`をpool件数で剰余したindexのtileを選ぶ。

viewport外候補が一つもない場合は、全candidateをplayerからのManhattan距離が遠い順、同距離では`y`、`x`の昇順に並べた先頭の最遠floorへfallbackする。最初のcandidateが一つもない場合は`null`を返す。

敵spawn時の`occupied`は、現在のplayer tile、activeな弾薬箱tile、対象以外のactiveな敵tileとする。初期spawnでは先に生成した敵もactive enemyとして除外されるため、12体を相互に重複させない。

## phase適用と状態更新

phaseの定期更新は出現phaseと主方向のHUDだけを更新する。phase境界ではactive enemyの位置、stable ID、spawn metadata、HP、移動状態を変更しない。

初期spawnまたはrespawnで既存`spawnEnemy`を呼ぶ時だけ、現在のphase、map seedから得た主方向、stable slotの割り当て方向、spawn時点のplayer tileを適用する。各enemy spriteは成功したspawnのstable ID、phase、主方向、割り当て方向、tileを保持する。

## HUDと観測契約

- `data-testid="spawn-phase"`は表示値に`phase + 1`、`data-phase`に0始まりのphaseを持つ。
- `data-testid="primary-direction"`は表示値に上・右・下・左、`data-direction`に`up`、`right`、`down`、`left`のいずれかを持つ。
- 各`data-testid="<enemy-id>-hp"`は、`data-stable-id`、`data-spawn-phase`、`data-primary-direction`、`data-assigned-direction`、`data-spawn-tile`を持つ。
- `data-spawn-tile`は`x,y`形式とし、既存のHP値とvisibility用data属性を同じoutputで維持する。

## DEV再出現経路

`debugRespawnEnemy(enemyId)`はDEV環境のE2E観測専用とし、通常の`spawnEnemy`を再利用してcurrent phaseを適用する。未知のID、terminal中、inactive enemyは拒否する。再出現に失敗した場合はrespawn count、位置、spawn metadata、bodyとvisibilityを直前状態へ戻して例外とする。

DEV環境だけ`window.__arenaScene`を公開する。production buildでは`window`へSceneまたは`debugRespawnEnemy`を公開しない。この経路を製品の敵撃破・respawn動作や利用者向けAPIとして扱わない。

## retry、terminal、generation、失敗時動作

- retryはrun generationを増やし、旧timerを停止し、`startedAt`、map、player、弾薬箱、敵12体、HUDを初期化する。新runの初期spawnはphase 0と新しいmap seedの主方向を使用する。
- victoryまたはdefeatのterminalでは敵respawn timerを含むrun timerを停止し、以後のspawnまたはrespawnを許可しない。
- timer callbackは登録時のgenerationと現在のgenerationが一致し、terminalでない場合だけ状態を変更する。旧generationのcallbackは現在runへ副作用を与えない。
- 通常の`spawnEnemy`でcandidateがない場合は対象enemyをinactiveかつ非表示のままにして`false`を返す。respawn callbackはcombat stateを復活させず、HUDへ再出現位置がないことを表示する。
- 初期12体のいずれかをspawnできない場合は、必要な初期配置を満たせないためrun初期化を失敗として例外にする。

## 検証期待値

- unit: `startedAt`より前と59999msではphase 0、60000ms境界ではphase 1、240000msではphase 4となる。
- unit: 同じseedとphaseは同じ主方向を返し、連続する4 phaseは4方向を一巡する。
- unit: 12 stable slotは各主方向について主9・反3となり、`index % 4 === 3`だけが反対方向となる。
- unit: 4方向それぞれのrequested directionで、player基準方向が一致するviewport外、到達可能、非重複floorを選ぶ。方向候補なしでは既存viewport外pool、viewport外なしでは最遠floorへfallbackする。
- unit: 初期12体のtileはplayer、弾薬箱、他の敵と重複せず、playerから到達可能である。
- E2E: phase 0のHUD、主方向、12個のstable IDとspawn metadataを観測でき、初期spawn tileが12個すべて異なる。
- E2E: 60000ms境界でHUDだけがphase 1へ進み、activeな12体のspawn metadataと位置は変化しない。DEV再出現させた1体だけがphase 1のmetadataと新しいtileを持つ。
- E2E: retry後はphase 0、敵12体、retry後map seedに対応する主方向となり、旧generationからの副作用がない。
- 既存回帰: enemy visibilityと暗転mask、有限弾薬、武器切替、射撃、リロード、ammo panel、3分勝利、弾薬箱respawn、defeat、retryを維持する。

## 対象外

wave director、敵数の動的増減、敵種別値とrespawn delayのbalance変更、複雑な方向比率、汎用spawn strategyまたは設定基盤、production向けdebug API、multiplayer sync、persistence、外部asset、新規依存、TypeScript用DOCGEN transformは対象外とする。
