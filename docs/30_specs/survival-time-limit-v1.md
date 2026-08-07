---
id: SPEC-SURVIVAL-TIME-LIMIT
requirements: REQ-SURVIVAL-TIME-LIMIT
---

# survival-time-limit-v1 仕様

## 時間と状態

run開始時刻を startedAt、現在のゲーム時刻を now とする。残り時間は次で求め、範囲を0〜300000msへ収める。

~~~text
remaining = min(300000, max(0, startedAt + 300000 - now))
~~~

now が startedAt + 300000 以上となる境界を含めてvictoryへ遷移する。CombatStateはdefeatedとは別にvictoryを持ち、victoryまたはdefeatをterminalとする。terminalでは既存の射撃、リロード完了、被ダメージ、敵ダメージ、敵再出現、ammo box取得を状態変更なしで拒否する。

retryCombatはvictory=false、defeated=false、HP100、武器別ammo/reserve、発射待ち、リロード、敵4個体を初期値として返す。

## #21/#35既存契約との境界

#21/#35のammo-supply-v1にある「同一run中は取得箱を再出現させない」は履歴契約として維持する。#34 follow-upが限定的にsupersedeするのはfield ammo box（map上のammo box）の再出現処理だけであり、既存の有限ammo契約、ammo/map配置文書、その他の#21/#35実装を変更しない。

survival timerとammo box復活timerはともに300000msであるため、run開始後に取得した箱の復活期限は通常survival victory後となる。victory/defeat/retryで復活timerを停止する確定条件を優先し、pending callbackはcancel/clearしてterminal後の復活を許可しない。

## HUDと結果表示

- 起動時と通常run中は残り時間をMM:SSで表示する。
- 300000ms境界では00:00を表示し、Victory UIをaria-liveで通知する。
- Victory UIと敗北UIは共有result panel内で排他的に表示する。
- 既存のdata-testid=defeatとdata-testid=retryを維持し、敗北からのretry導線を変更しない。
- retry後はresult panelを隠し、HUDを通常runの初期値へ戻す。
- 既存のammo panel、有限弾薬、reload progressは同じDOM契約を保つ。

## ammo boxの復活

各箱はtile key（x,y）と元tileを保持する。取得成功時だけ、箱をstatic groupから削除し、同じkeyに対するrespawn TimerEventを1つ登録する。delayは300000ms固定とする。

TimerEvent callbackはrun generationとterminal stateを確認する。generationが一致し、terminalでない場合だけ元tileへ箱を生成する。callback実行前の同じkeyのtimer登録は禁止し、callbackでもactiveな同じkeyの箱がある場合はspawnを省略する。復活した箱は通常の箱取得overlapへ戻る。

victory、defeat、retryでは復活timerを停止してMapから外し、旧generationのcallbackを無効化する。terminalへ入ったrunの箱を後から復活させない。

## 状態遷移と停止

~~~mermaid
stateDiagram-v2
  [*] --> playing
  playing --> playing: HUD更新・射撃・リロード・箱取得
  playing --> victory: now >= startedAt + 300000ms
  playing --> defeat: HP == 0
  victory --> playing: retry
  defeat --> playing: retry
~~~

victoryまたはdefeatへ入ったとき、reloadTimer、敵respawn、命中flash、ammo box respawn、生存timerを停止し、player/enemy velocityを0、弾を無効化、物理演算をpauseする。retryではgenerationを更新してtimer/map/sprite/state/HUDを初期化後、物理演算をresumeする。

## 検証期待値

- unit: 300000ms直前は残り1msかつ通常、境界は残り0msかつvictory、victoryからの再遷移は無副作用、retryはvictory=false。
- E2E: 初期05:00、境界後のVictory UI、戦闘停止、retry後05:00とammo/reload初期化。
- E2E: 箱取得後はcountが1減り、復活待ち中のactive tile keyは元keyを含まない。同じoverlapを繰り返してもcountとtimer数を増やさない。
- E2E: 箱取得後はHUDのdata-respawn-tilesに元keyが1つだけ現れ、同じoverlapを繰り返しても同じ値を保つ。terminal停止後は空になる。正の復活は同時刻競合のため検証しない。
- E2E: Victory/defeat/retry後に旧timerが現在runへ箱、敵、リロード、HUDの副作用を与えない。
- 既存E2E: 有限弾薬、ショットガン発射待ち、リロード進捗、敗北、retry、視界表示を維持する。

## 対象外

recovery item、enemy time scaling、multiplayer sync、persistence、inventory、wave/drop、map配置規則の変更、#21/#35の既存実装とammo/map配置文書の変更、新規DOCGEN transformは対象外とする。
