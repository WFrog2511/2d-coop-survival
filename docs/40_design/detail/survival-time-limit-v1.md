---
id: DESIGN-DETAIL-SURVIVAL-TIME-LIMIT
requirements: REQ-SURVIVAL-TIME-LIMIT
specification: SPEC-SURVIVAL-TIME-LIMIT
---

# survival-time-limit-v1 詳細設計

## Issue #77の限定同期

[DESIGN-DETAIL-AMMO-MATERIAL-V1](ammo-material-v1.md) を、AmmoType、reserve、旧world ammo、初期ammo表現の現行詳細として参照する。本書のTimerEvent、generation guard、terminal、retry、stable box respawnの詳細は維持し、全体を supersede しない。

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | #71前の3分生存制限、victory UI、ammo box復活 |
| 対応Issue | #34 / comment 5220638729 / follow-up PR #36 |
| 対応する要件 | REQ-SURVIVAL-TIME-LIMIT |
| 対応する仕様 | SPEC-SURVIVAL-TIME-LIMIT |
| ステータス | 実装済み、技術検証済み（pnpm check / Playwright E2E / bundle / docs link） |
| DOCGEN | TypeScriptのため手動同期。新規transformなし |

## 0. #21/#35既存契約との境界

[DESIGN-DETAIL-WAVE-PROGRESSION](wave-progression-v1.md)は、この詳細設計の180000ms timer、各60000ms wave、630000ms自動勝利を、Day 1から無期限Boss Nightまでの8 phaseへsupersedeする。現在の時間、phase、HUD、Boss撃破victoryは同設計を正本とする。terminal guard、retry、ammo box復活は維持する。

#21/#35のammo-supply-v1にある「同一run中は取得箱を再出現させない」は履歴契約として維持する。#34 follow-upが限定的にsupersedeするのはfield ammo box（map上のammo box）の再出現処理だけであり、既存の有限ammo契約、ammo/map配置文書、その他の#21/#35実装は変更しない。

#71前のsurvival timerは180000msであり、ammo box復活timerは取得から30000msである。victory/defeat/retryで復活timerを停止・clearするterminal優先を守り、pending callbackはそのrunのterminal後に実行させない。

## 1. #71前のデータと純粋関数（履歴）

CombatStateへvictory:booleanを追加し、INITIAL_STATEとretryCombatではfalseとする。SURVIVAL_LIMIT_MSは180000、AMMO_BOX_RESPAWN_MSは30000とする。

remainingSurvivalMs(startedAt, now)は残り時間を0〜180000msにclampする。hasReachedSurvivalLimit(startedAt, now)はnowがstartedAt+180000以上かを判定する。advanceSurvivalStateはdefeat、既存victory、期限未到達なら同じstate objectを返し、期限到達時だけvictory=true、reloading=nullの新stateを返す。

terminal guardは射撃、武器切替、リロード開始・完了、プレイヤー被ダメージ、敵ダメージ・再出現、ammo box取得へ適用する。cancelReloadだけはterminal cleanupのためreloadingを解除できる。

## 2. #71前のScene timerとgeneration（履歴）

Arena.resetはgenerationを増加させ、survivalTimer、敵respawns、flashes、ammoBoxRespawns、reloadTimerを停止・clearする。retryCombat、survivalStartedAt、map、box group、enemy、bullet、HUDを初期化し、mapと敵の構築後に現runのsurvivalTimerを180000msで作成する。

updateは毎frame、純粋関数で期限を確認してHUDを更新する。期限到達時は共通terminal処理へ入り、timerを停止する。survivalTimer callbackにもgeneration guardを置き、retry後に旧callbackがvictoryへ遷移させない。

## 3. 箱の識別と復活

箱spriteにはstableなboxId、currentTileの複製、tile key（x,y）、AmmoType、現在数量をdataとして持たせる。boxIdごとのstateはoriginTile、currentTile、respawnCount、AmmoType、数量を保持し、tile keyはtimer identityには使わない。敵spawnのoccupied判定にはactive boxのcurrentTileだけを渡す。

取得成功時の処理は次の順序とする。

1. terminal、inactive、boxId/state data欠落、同boxIdの待機timerがあれば終了する。
2. rulesのcollectTypedAmmoBoxが正の取得量を返した場合だけ対応reserveを更新する。
3. partialなら同じ箱と残量を維持し、残量0だけstatic groupから削除する。
4. 空になったstable boxだけ同boxIdのammoBoxRespawnsへ30000ms TimerEventを1つ登録する。
5. HUDの残箱数、active boxId/current tile/type/quantity、pending boxIdを更新する。

callbackではtimer mapからboxIdを先に削除し、generation一致かつ非terminalの場合だけ現在のplayer tile、camera viewport、active box、active world item（weapon/material/ammo）、active enemyをoccupiedにしてselectSpawnTileを呼ぶ。selectSpawnTileは到達可能floorのviewport外を優先し、候補がなければ最遠floorへfallbackする。boxIdのoriginTileはoccupiedとして元位置への復活を避け、seedはnextSeedへmap seed、slot、respawnCountを渡してrun内で再現可能にする。spawnAmmoBoxはactiveな同boxIdまたは同tileの箱を検査してから生成するため、同じ箱の重複生成を防ぐ。terminalまたはretryの停止後はcallbackの世代が不一致となり副作用を持たない。

## 4. #71前のterminalとUI（履歴）

共通terminal処理はreloadTimer、敵respawn、flash、生存timer、箱復活timerを停止し、reloadingを解除する。player/enemy velocityを0、全弾をdisable、physics.pauseとする。result panelのstateをvictoryまたはdefeatへ設定し、一方の結果だけを表示してretryへfocusを移す。

残り時間はceil(remainingMs/1000)を分・秒へ変換し、常にMM:SSとする。境界では00:00となる。Victory UIはaria-live="assertive"の共有result panel内に置き、既存のdata-testid=defeat/retryを維持する。

## 5. 失敗時動作と対象外

map生成、敵spawn、既存ammo/reloadの失敗処理は既存経路を維持する。旧generationのtimer callback、terminal中の入力、同boxIdの重複overlapは無副作用で終了する。候補がまったくない復活callbackは箱spriteを生成せずHUDへ失敗を表示する。terminalになったrunの復活待ち箱は復活させず、retryで新mapの箱4個へ初期化する。

recovery item、enemy time scaling、multiplayer sync、persistence、inventory/loot、wave固有の新敵、intermission、quota、報酬、drop、map配置変更、#21/#35の実装変更、既存ammo/map配置文書変更は対象外とする。

## 6. #71前の検証期待値（時間契約は履歴）

| レベル | ケース | 期待結果 |
| --- | --- | --- |
| unit | 180000ms直前 | remaining=1、通常state |
| unit | 180000ms境界 | remaining=0、victory=true |
| unit | 30000ms箱復活 | 固定遅延、boxId identity |
| unit | victory guard | 射撃、リロード、被ダメージ、敵、箱取得が同一object |
| unit | retry | victory=false、既存初期stateと同じ |
| E2E | 起動 | 03:00、有限ammo、reload progress初期値 |
| E2E | victory | Victory UI、00:00、戦闘停止 |
| E2E | retry | 結果UI非表示、03:00、ammo/reload/map/HUD初期化 |
| E2E | ammo box | 元tileと異なるviewport外の到達可能floorへsame boxIdで復活し、data-respawn-boxesは1つだけ登録。同じoverlap後も重複せず、terminalでclear |

このTypeScript詳細設計はDOCGENで生成せず、実装差分と手動同期する。
