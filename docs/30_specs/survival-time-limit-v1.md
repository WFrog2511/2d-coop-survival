---
id: SPEC-SURVIVAL-TIME-LIMIT
requirements: REQ-SURVIVAL-TIME-LIMIT
---

# survival-time-limit-v1 仕様

## #71前の時間と状態（履歴）

run開始時刻を startedAt、現在のゲーム時刻を now とする。残り時間は次で求め、範囲を0〜180000msへ収める。

~~~text
remaining = min(180000, max(0, startedAt + 180000 - now))
~~~

now が startedAt + 180000 以上となる境界を含めてvictoryへ遷移する。CombatStateはdefeatedとは別にvictoryを持ち、victoryまたはdefeatをterminalとする。terminalでは既存の射撃、リロード完了、被ダメージ、敵ダメージ、敵再出現、ammo box取得を状態変更なしで拒否する。

retryCombatはvictory=false、defeated=false、HP100、武器別ammo/reserve、発射待ち、リロード、敵12個体を初期値として返す。敵の個体数と方向契約は[SPEC-DIRECTIONAL-SPAWN](directional-spawn-v1.md)が旧4個体の契約をsupersedeする。

## Issue #58の限定移行

[SPEC-WAVE-PROGRESSION](wave-progression-v1.md)は、本仕様の180000ms期限と各60000ms waveをdynamic RunState scheduleへsupersedeする。既定はenemy-free初回準備60000ms、3 combat wave各150000ms、wave 1/2後のrest各60000ms、総630000msである。この文書内の旧時間式、03:00 HUD、180000ms境界の期待値、状態遷移、検証は#71前の履歴であり、現在の時間・phase・HUD仕様はSPEC-WAVE-PROGRESSIONを正本とする。victory state、terminal guard、retryCombat、ammo box規則は維持し、combat開始後のphase境界でenemy配置、HP、directional spawn metadataを変更しない。

## #21/#35既存契約との境界

#21/#35のammo-supply-v1にある「同一run中は取得箱を再出現させない」は履歴契約として維持する。#34 follow-upが限定的にsupersedeするのはfield ammo box（map上のammo box）の再出現処理だけであり、既存の有限ammo契約、ammo/map配置文書、その他の#21/#35実装を変更しない。

#71前のsurvival timerは180000msであり、ammo box復活timerは取得から30000msである。victory/defeat/retryで復活timerを停止する確定条件を優先し、pending callbackはcancel/clearしてterminal後の復活を許可しない。

## #71前のHUDと結果表示（履歴）

- 起動時と通常run中は残り時間をMM:SSで表示する。
- 180000ms境界では00:00を表示し、Victory UIをaria-liveで通知する。
- Victory UIと敗北UIは共有result panel内で排他的に表示する。
- 既存のdata-testid=defeatとdata-testid=retryを維持し、敗北からのretry導線を変更しない。
- retry後はresult panelを隠し、HUDを通常runの初期値へ戻す。
- 既存のammo panel、有限弾薬、reload progressは同じDOM契約を保つ。

## ammo boxの復活

各箱はstableなboxId、現在tile、元tile、復活回数を保持する。tile keyは現在位置の表示用であり、timer identityには使わない。取得成功時だけ、箱をstatic groupから削除し、boxIdに対するrespawn TimerEventを1つ登録する。delayは30000ms固定とする。

TimerEvent callbackはrun generationとterminal stateを確認する。generationが一致し、terminalでない場合だけ、現在のplayer tile、camera viewport、active box、active world item（weapon/material/ammo）、active enemyをoccupiedにして既存selectSpawnTileを呼ぶ。候補は到達可能なmap内floorからviewport外を優先し、候補がなければ最遠floorへfallbackする。復活した箱は元tileを避け、同じboxIdまたは同じtileにactive boxを重複生成せず、通常の箱取得overlapへ戻る。seedはnextSeedとmap seed、boxIdのslot、復活回数から決定する。

victory、defeat、retryでは復活timerを停止してMapから外し、旧generationのcallbackを無効化する。terminalへ入ったrunの箱を後から復活させない。

## 失敗時動作

viewport外候補がない場合はselectSpawnTileの最遠floor fallbackを使う。floorがplayerから到達不能、occupied、またはmap外なら候補から除外する。候補がまったくない場合はcallback開始時にTimerEventをammoBoxRespawns Mapから削除し、boxIdはpending属性を保持せずspriteなしのまま、HUDへ再配置失敗を表示する。旧generation、terminal中、同じboxIdのtimerまたはactive boxがあるcallbackは副作用なしで終了する。

## #71前の状態遷移と停止（履歴）

~~~mermaid
stateDiagram-v2
  [*] --> playing
  playing --> playing: HUD更新・射撃・リロード・箱取得
  playing --> victory: now >= startedAt + 180000ms
  playing --> defeat: HP == 0
  victory --> playing: retry
  defeat --> playing: retry
~~~

victoryまたはdefeatへ入ったとき、reloadTimer、敵respawn、命中flash、ammo box respawn、生存timerを停止し、player/enemy velocityを0、弾を無効化、物理演算をpauseする。retryではgenerationを更新してtimer/map/sprite/state/HUDを初期化後、物理演算をresumeする。

## #71前の検証期待値（時間契約は履歴）

- unit: 180000ms直前は残り1msかつ通常、境界は残り0msかつvictory、30000msは箱復活遅延、victoryからの再遷移は無副作用、retryはvictory=false。
- E2E: 初期03:00、境界後のVictory UI、戦闘停止、retry後03:00とammo/reload初期化。
- E2E: 箱取得後はcountが1減り、stable boxIdのpending timerが1つだけ登録される。同じoverlapを繰り返してもcount、timer、boxIdを増やさない。
- E2E: 30000ms後は元tileと異なるmap内floorへboxIdを保って復活し、viewport外、到達可能、active box ID重複なしとなる。
- E2E: Victory/defeat/retry後は旧timerが現在runへ箱、敵、リロード、HUDの副作用を与えず、pending属性が空になる。
- 既存E2E: 有限弾薬、ショットガン発射待ち、リロード進捗、敗北、retry、視界表示を維持する。

## 対象外

recovery item、enemy time scaling、multiplayer sync、persistence、inventory、wave固有の新敵、intermission、quota、報酬、drop、map配置規則の変更、#21/#35の既存実装とammo/map配置文書の変更、新規DOCGEN transformは対象外とする。
