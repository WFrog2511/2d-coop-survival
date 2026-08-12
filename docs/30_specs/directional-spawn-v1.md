---
id: SPEC-DIRECTIONAL-SPAWN
requirements: REQ-DIRECTIONAL-SPAWN
---

# directional-spawn-v1 仕様

## 正本と同期範囲

- Definition of Deliveryは[Issue #22 comment 5222574276](https://github.com/WFrog2511/2d-coop-survival/issues/22#issuecomment-5222574276)を正本とする。
- 敵循環、balance、HUDのfollow-upは[Issue #38](https://github.com/WFrog2511/2d-coop-survival/issues/38)が本書の旧HP・spawn fallback・delay記述を限定的に上書きする。
- 合意済み要件は[REQ-DIRECTIONAL-SPAWN](../20_requirements/directional-spawn-v1.md)を参照する。
- 本仕様はTypeScript実装と手動で同期する。現行DOCGENはPython sourceだけを対象とするため、DOCGEN検査のPASSを本仕様とTypeScriptの同期確認へ読み替えない。

## Issue #58の時間契約移行

[SPEC-WAVE-PROGRESSION](wave-progression-v1.md)（Issue #71条件変更後）は、Issue #34由来の180000ms（03:00）期限だけでなく、本書の`run開始`をphase epochおよびinitial/stagger開始点とする記述・検証期待値も限定的にsupersedeする。既定はenemy-free初回準備60000ms、3 combat wave各150000ms、wave 1/2後のrest各60000ms、総630000msである。本書内の3分勝利・180000ms terminalと旧run開始時initial/stagger記述は#71前の履歴として残し、現在の時間・phase残り・victory境界はSPEC-WAVE-PROGRESSIONを正本とする。60000ms spawn phaseは初回combat開始をepochとし、`status=playing && elapsedMs >= restDurationMs`を満たす最初のupdateでcurrent phaseにかかわらず一度だけlifecycleを開始する。方向計算、strict spawn、terminal/retryのgeneration guard、ammo box契約は変更しない。

## phaseと主方向

enemy lifecycle開始後のcombat epochを`combatStartedAt`、現在のゲーム時刻を`now`とし、0始まりのphaseを次で求める。preparation中のHUDはphase 0を表示するが、このepochはまだ開始していない。

~~~text
phase = floor(max(0, now - combatStartedAt) / 60000)
~~~

`now <= combatStartedAt`と初回combat直後はphase 0、`combatStartedAt + 60000`の境界でphase 1とする。HUDの表示値は`phase + 1`とする。

方向の順序は`up`、`right`、`down`、`left`で固定する。主方向はmap seedをunsigned 32-bit値として扱い、`(seed + phase) % 4`に対応する方向を選ぶ。同じmap seedとphaseは常に同じ主方向となり、連続する4 phaseで4方向を決定的に一巡する。

## stable slotと敵構成

敵のstable slotは次の順序の0始まりindexとする。

1. `basic-1`から`basic-9`
2. `drone-1`から`drone-3`

`index % 4 === 3`のslotだけを主方向の反対方向へ割り当て、それ以外を主方向へ割り当てる。12 slotでは主方向9体、反対方向3体となり、他の2方向は使用しない。反対方向は方向順序上で主方向から2つ先とする。

基本敵はHP 4、速度68、接触damage 8とする。高速ドローンはHP 2、速度150、接触damage 6とし、小口径を含むdamage multiplierを1としてライフルdamage 2の1発で撃破できる。基本敵は`basic-1..3=direct`、`4..6=left`、`7..9=right`へ固定し、stable ID seedのBFS tie-breakと`TILE_SIZE`未満の局所分離を使う。ドローンは直接経路と既存横移動を使う。

## Issue #38 populationと循環

初回combat epochのphase 0の初期対象は`basic-1`〜`basic-6`、`drone-1`〜`drone-2`の8体である。`basic-7`、`basic-8`、`basic-9`、`drone-3`をcombat epochから3000/6000/9000/12000msで予約し、成功後にactive 12体とする。

enemy専用`selectEnemySpawnTile`は到達可能、未占有、actual camera viewport外、`enemyVisibility(...)=hidden`、stable slotの割り当て方向をすべて必須とする。弾薬箱用`selectSpawnTile`のfallbackは変更しない。enemy候補なしではinactive/hiddenを維持し、同じspawn reasonを1000ms後に再試行する。

death delayは基本敵5000〜9000ms、ドローン3000〜6000msで決定的に選ぶ。strict spawn成功後だけ`respawnEnemy`で全HPへ戻す。hidden recycleはhidden継続8000〜12000ms、最終被弾から3000ms以上、最短経路10 edge以上、他recycleなしを必須とし、HPを変えずinactive化して2000〜4000ms後にstrict re-entryする。recycle lockは1体だけで、候補なしretry中も保持する。

## player基準の方向判定

spawn時点のplayer tileを`player`、候補tileを`target`とし、`dx = target.x - player.x`、`dy = target.y - player.y`を求める。

- `abs(dx) > abs(dy)`なら水平方向とし、`dx > 0`は`right`、それ以外は`left`とする。
- それ以外は垂直方向とし、`dy > 0`は`down`、それ以外は`up`とする。
- 水平差と垂直差が同じ場合は垂直方向を採用する。

## spawn tile選択

enemy用`selectEnemySpawnTile`は次の順で候補を絞り込む。

1. map内のfloor tileから、spawn時点のplayer tileへ到達可能で、`occupied`に含まれないcandidateを作る。
2. candidateのうち現在のcamera viewport外にあるtileを抽出する。
3. `enemyVisibility(...)=hidden`かつrequired directionとplayer基準方向が一致するtileだけを残す。
4. strict poolの順序を維持し、`seed >>> 0`をpool件数で剰余したindexのtileを選ぶ。0件は`null`とする。

弾薬箱用`selectSpawnTile`だけはviewport外なしで最遠floorへfallbackする。enemy用selectorはstrict条件を一つでも満たせなければ`null`を返す。

敵spawn時の`occupied`は、現在のplayer tile、activeな弾薬箱tile、activeなworld item（weapon/material）のtile、対象以外のactiveな敵tileとする。初期spawnでは先に生成した敵もactive enemyとして除外されるため、12体を相互に重複させない。

## phase適用と状態更新

phaseの定期更新は出現phaseと主方向のHUDだけを更新する。phase境界ではactive enemyの位置、stable ID、spawn metadata、HP、移動状態を変更しない。

初期、stagger、death、recycleまたはDEV respawnで`spawnEnemy`を呼ぶ時だけcurrent phaseを適用する。各spriteはstable ID、phase、主方向、割り当て方向、tile、active、spawn reason、recycle countを保持する。

## HUDと観測契約

- `data-testid="spawn-phase"`は表示値に`phase + 1`、`data-phase`に0始まりのphaseを持つ。
- `data-testid="primary-direction"`は表示値に上・右・下・左、`data-direction`に`up`、`right`、`down`、`left`のいずれかを持つ。
- 各`data-testid="<enemy-id>-hp"`は、`data-stable-id`、`data-spawn-phase`、`data-primary-direction`、`data-assigned-direction`、`data-spawn-tile`を持つ。
- `data-spawn-tile`は`x,y`形式とし、既存のHP値とvisibility用data属性を同じoutputで維持する。
- `data-active`、`data-spawn-reason`、`data-recycle-count`を同じoutputへ同期する。
- `survival-time`はCanvas上部中央、`hp`と`hp-bar(max=100)`は左下、ammo panelは右下へ置き、overlayはpointer入力を遮らない。

## DEV再出現経路

`debugRespawnEnemy(enemyId)`はDEV環境のE2E観測専用とし、通常の`spawnEnemy`を再利用してcurrent phaseを適用する。未知のID、terminal中、inactive enemyは拒否する。再出現に失敗した場合はrespawn count、位置、spawn metadata、bodyとvisibilityを直前状態へ戻して例外とする。

DEV環境だけ`window.__arenaScene`を公開する。production buildでは`window`へSceneまたは`debugRespawnEnemy`を公開しない。この経路を製品の敵撃破・respawn動作や利用者向けAPIとして扱わない。

## retry、terminal、generation、失敗時動作

- retryはgenerationを増やし、stagger/retry/death/recycleを含む全enemy TimerEventを停止してenemy-free preparationへ戻す。初期8体と段階投入予約は次の初回combat epochで再構築する。
- victoryまたはdefeatでは全enemy TimerEventとrecycle lockを停止し、以後のcallbackをgeneration/terminal guardで拒否する。
- timer callbackは登録時のgenerationと現在のgenerationが一致し、terminalでない場合だけ状態を変更する。旧generationのcallbackは現在runへ副作用を与えない。
- `spawnEnemy`でstrict candidateがない場合はinactive/hiddenを維持し、同じreasonの1000ms retryを予約する。death stateは成功まで復活させず、recycle stateのHPは変更しない。

## 検証期待値

- unit: `combatStartedAt`より前と59999msではphase 0、60000ms境界ではphase 1、240000msではphase 4となる。
- unit: 同じseedとphaseは同じ主方向を返し、連続する4 phaseは4方向を一巡する。
- unit: 12 stable slotは各主方向について主9・反3となり、`index % 4 === 3`だけが反対方向となる。
- unit: enemy selectorは4方向それぞれでdirection、viewport外、hidden、reachable、unoccupiedを必須とし、候補なしは`null`である。弾薬箱fallbackは回帰させない。
- unit/E2E: 初期8体と段階投入後12体の成功tileはplayer、弾薬箱、他enemyと重複しない。
- E2E: 初期8 IDと4段階投入、strict offscreen/hidden/direction、HP 4/2、spawn reason、overlay位置を観測する。
- E2E: 60000ms境界でHUDだけがphase 1へ進み、activeな12体のspawn metadataと位置は変化しない。DEV再出現させた1体だけがphase 1のmetadataと新しいtileを持つ。
- E2E: retry後はenemy-free preparationとphase 0表示、retry後map seedの主方向となる。次の初回combat epochで初期8体activeと4体のstagger予約が一度だけ作られ、旧generationからの副作用がない。
- 既存回帰: enemy visibilityと暗転mask、有限弾薬、武器切替、射撃、リロード、ammo panel、3分勝利、弾薬箱respawn、defeat、retryを維持する。

## 対象外

wave director、stable 12体を超える動的増加、phase連動balance、汎用spawn strategyまたは設定基盤、production向けdebug API、multiplayer sync、persistence、外部asset、新規依存、TypeScript用DOCGEN transformは対象外とする。
