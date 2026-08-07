---
id: DESIGN-DETAIL-SURVIVAL-TIME-LIMIT
requirements: REQ-SURVIVAL-TIME-LIMIT
specification: SPEC-SURVIVAL-TIME-LIMIT
---

# survival-time-limit-v1 詳細設計

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | 5分生存制限、victory UI、ammo box復活 |
| 対応Issue | #34 / comment 5218660533 |
| 対応する要件 | REQ-SURVIVAL-TIME-LIMIT |
| 対応する仕様 | SPEC-SURVIVAL-TIME-LIMIT |
| ステータス | 実装済み、技術検証済み（pnpm check / Playwright E2E / bundle / docs link） |
| DOCGEN | TypeScriptのため手動同期。新規transformなし |

## 0. #21/#35既存契約との境界

#21/#35のammo-supply-v1にある「同一run中は取得箱を再出現させない」は履歴契約として維持する。#34 follow-upが限定的にsupersedeするのはfield ammo box（map上のammo box）の再出現処理だけであり、既存の有限ammo契約、ammo/map配置文書、その他の#21/#35実装は変更しない。

survival timerとammo box復活timerはともに300000msであるため、run開始後に取得した箱の復活期限は通常survival victory後となる。victory/defeat/retryで復活timerを停止・clearするterminal優先を守り、pending callbackはそのrunのterminal後に実行させない。

## 1. データと純粋関数

CombatStateへvictory:booleanを追加し、INITIAL_STATEとretryCombatではfalseとする。SURVIVAL_LIMIT_MSとAMMO_BOX_RESPAWN_MSはともに300000とする。

remainingSurvivalMs(startedAt, now)は残り時間を0〜300000msにclampする。hasReachedSurvivalLimit(startedAt, now)はnowがstartedAt+300000以上かを判定する。advanceSurvivalStateはdefeat、既存victory、期限未到達なら同じstate objectを返し、期限到達時だけvictory=true、reloading=nullの新stateを返す。

terminal guardは射撃、武器切替、リロード開始・完了、プレイヤー被ダメージ、敵ダメージ・再出現、ammo box取得へ適用する。cancelReloadだけはterminal cleanupのためreloadingを解除できる。

## 2. Scene timerとgeneration

Arena.resetはgenerationを増加させ、survivalTimer、敵respawns、flashes、ammoBoxRespawns、reloadTimerを停止・clearする。retryCombat、survivalStartedAt、map、box group、enemy、bullet、HUDを初期化し、mapと敵の構築後に現runのsurvivalTimerを300000msで作成する。

updateは毎frame、純粋関数で期限を確認してHUDを更新する。期限到達時は共通terminal処理へ入り、timerを停止する。survivalTimer callbackにもgeneration guardを置き、retry後に旧callbackがvictoryへ遷移させない。

## 3. 箱の識別と復活

箱spriteにはtileの複製とtile key（x,y）をdataとして持たせる。ammoBoxTilesは現mapの元位置一覧として保持し、敵spawnのoccupied判定から箱の元位置を除外し続ける。

取得成功時の処理は次の順序とする。

1. terminal、inactive、tile data欠落、同keyの待機timerがあれば終了する。
2. rulesのcollectAmmoBoxがcollected=trueを返した場合だけ状態を更新する。
3. static groupから箱を削除する。
4. 同keyのammoBoxRespawnsへ300000ms TimerEventを1つ登録する。
5. HUDの残箱数、active tile key、pending respawn tile keyを更新する。

callbackではtimer mapからkeyを先に削除し、generation一致かつ非terminalの場合だけspawnAmmoBox(tile)を呼ぶ。spawnAmmoBoxはactiveな同keyの箱を検査してから生成するため、同じ箱の重複生成を防ぐ。terminalまたはretryの停止後はcallbackの世代が不一致となり副作用を持たない。

## 4. terminalとUI

共通terminal処理はreloadTimer、敵respawn、flash、生存timer、箱復活timerを停止し、reloadingを解除する。player/enemy velocityを0、全弾をdisable、physics.pauseとする。result panelのstateをvictoryまたはdefeatへ設定し、一方の結果だけを表示してretryへfocusを移す。

残り時間はceil(remainingMs/1000)を分・秒へ変換し、常にMM:SSとする。境界では00:00となる。Victory UIはaria-live="assertive"の共有result panel内に置き、既存のdata-testid=defeat/retryを維持する。

## 5. 失敗時動作と対象外

map生成、敵spawn、既存ammo/reloadの失敗処理は既存経路を維持する。旧generationのtimer callback、terminal中の入力、同keyの重複overlapは無副作用で終了する。terminalになったrunの復活待ち箱は復活させず、retryで新mapの箱4個へ初期化する。

recovery item、enemy time scaling、multiplayer sync、persistence、inventory/loot、wave/drop、map配置変更、#21/#35の実装変更、既存ammo/map配置文書変更は対象外とする。

## 6. 検証期待値

| レベル | ケース | 期待結果 |
| --- | --- | --- |
| unit | 300000ms直前 | remaining=1、通常state |
| unit | 300000ms境界 | remaining=0、victory=true |
| unit | victory guard | 射撃、リロード、被ダメージ、敵、箱取得が同一object |
| unit | retry | victory=false、既存初期stateと同じ |
| E2E | 起動 | 05:00、有限ammo、reload progress初期値 |
| E2E | victory | Victory UI、00:00、戦闘停止 |
| E2E | retry | 結果UI非表示、05:00、ammo/reload/map/HUD初期化 |
| E2E | ammo box | 元tile keyを保持し、data-respawn-tilesに1つだけ登録。同じoverlap後も重複せず、terminalでclear |

このTypeScript詳細設計はDOCGENで生成せず、実装差分と手動同期する。
