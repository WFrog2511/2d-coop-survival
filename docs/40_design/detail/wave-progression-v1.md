---
id: DESIGN-DETAIL-WAVE-PROGRESSION
requirements: REQ-WAVE-PROGRESSION
specification: SPEC-WAVE-PROGRESSION
---

# wave-progression-v1 詳細設計

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | 3回の昼夜、Final Day、Boss Night、明示Boss撃破、terminal/retry |
| 対応する基本設計 | [DESIGN-BASIC-WAVE-PROGRESSION](../basic/wave-progression-v1.md) |
| 対応する要件 | [REQ-WAVE-PROGRESSION](../../20_requirements/wave-progression-v1.md) |
| 対応する仕様 | [SPEC-WAVE-PROGRESSION](../../30_specs/wave-progression-v1.md) |
| 実装task | [Issue #78](https://github.com/WFrog2511/2d-coop-survival/issues/78) |
| DOCGEN | TypeScriptのみ。生成blockとtransformを追加しない |

## 1. 業務ルール

| ID | ルール |
| --- | --- |
| BR-001 | phase順序はDay 1、Night 1、Day 2、Night 2、Day 3、Night 3、Final Day、Boss Nightで固定する |
| BR-002 | 先頭7 phaseは個別durationを持ち、Boss Nightはdurationを持たない |
| BR-003 | 通常Nightは敵残数に関係なく時間で終了し、時間だけではvictoryへ遷移しない |
| BR-004 | Boss Night中のBoss撃破eventだけがvictoryを成立させる |
| BR-005 | Night 1開始時だけinitial/stagger/directional spawn lifecycleを開始する |
| BR-006 | 以後のphase境界はactive enemyの位置、HP、stable ID、metadataを変更しない |
| BR-007 | UIはrun clockを止めず、terminalだけがgameplayを停止する |
| BR-008 | retryは採用scheduleを保ち、Day 1、elapsed 0、kills 0、全slot waitingへ戻す |
| BR-009 | durationは手動調整値とし、値だけを固定するunit testを作らない |

## 2. 状態と導出

`RunState`は`status`、`schedule`、`elapsedMs`、`kills`、`enemySlots`を保持する。Phaser object、TimerEvent、map、表示文字列は保持しない。

~~~mermaid
stateDiagram-v2
  [*] --> playing
  playing --> playing: advance / Boss Night開始でclamp
  playing --> victory: Boss Night中のBoss撃破
  playing --> defeat: player HPが0
  victory --> playing: retryRun
  defeat --> playing: retryRun
~~~

`TIMED_RUN_PHASES`は7定義を順序付きで保持する。各phase開始は先行durationの和、終了は開始 + 該当durationである。`elapsedMs`が終了未満の最初の定義を現在phaseとし、該当がなければBoss Nightとする。

`normalizedRunElapsedMs`はNaNを0、有限値をfloorし、0から`runDurationMs`までへclampする。`advanceRunState`は現在値とのmaxを使うため巻き戻らない。`remainingPhaseMs`は時間制phaseだけ終了 - elapsedを返し、Boss Nightは`null`を返す。

## 3. event契約

| event | 前提 | RunState | CombatState / runtime |
| --- | --- | --- | --- |
| 時間進行 | playing | elapsedだけを単調増加。Boss Nightでclamp | HUD/paletteを同期し、Boss Night開始後もplaying |
| Boss撃破 | playingかつBoss Night | victory | `completeCombatVictory`後に既存terminalへ入る |
| Boss撃破 | Boss Night以外またはterminal | 同じstate | 副作用なし |
| player defeat | playing | defeat | 既存terminalへ入る |
| retry | terminalまたはplaying | 同scheduleの初期state | generation、map、enemy lifecycleを初期化 |
| enemy spawn | playingかつ非active slot | active | sprite生成成功後だけ記録 |
| enemy death | playingかつactive | respawning、kills + 1 | 既存death respawnを予約 |
| hidden recycle | playingかつactive | recycling、kills不変 | HPを維持してre-entryを予約 |

## 4. Arena adapter

1. create時にDEV queryを一度解決し、`createRunSchedule`へ渡す。
2. reset時に`retryRun(schedule)`と`retryCombat(role)`を作り、`survivalStartedAt`、generation、enemy lifecycle flagを初期化する。
3. 毎frame、`now - survivalStartedAt`を`advanceRunState`へ渡す。
4. elapsedが`runPhaseStartMs(schedule, 'night-1')`以上になった最初のframeでだけ`startEnemyLifecycle`を呼び、Night 1開始時刻をdirectional spawn epochにする。
5. phase種別が変わったときだけground/wall artを450ms crossfadeする。static collisionは再構築しない。
6. Boss Night開始境界のTimerEventは経過時間をclampして終了するが、terminalへ入らない。
7. Boss撃破adapterは先に`recordBossDefeated`が遷移可能か確認し、`enterTerminal('victory')`の共通guardでも同じ条件を確認する。
8. defeat/victory時は既存enemy/reload/ammo box/survival timer、velocity、bullet、physicsを停止する。

大きな時計進行でNight 1を飛び越えた場合も、未開始flagとgeneration guardによりenemy lifecycleを一度だけ開始する。terminal後または旧generationのcallbackはRunStateとspriteへ副作用を与えない。

## 5. DEV queryとHUD

各schedule keyは500〜300000の安全な整数だけを採用する。個別keyがなければ、Nightは`combatWaveDurationMs`、Dayは`restDurationMs`を互換fallbackとして使う。無効値はphaseごとの既定へ戻し、productionではqueryを読まない。

| 観測面 | 表示・属性 |
| --- | --- |
| `wave` | 1〜3、`FINAL`、`BOSS` |
| `run-phase` | phaseごとの日本語label、`data-phase`、`data-phase-id` |
| `phase-remaining` | `MM:SS`またはBoss Nightの`--:--` |
| `run-panel` | kills、7 keyの`data-run-config` |
| hidden互換output | Boss Nightまでの残り、Night残り、enemy current/goal/remaining |

## 6. 失敗時動作

| 条件 | 動作 |
| --- | --- |
| 無効DEV query | 該当phaseだけ既定値へ戻す |
| strict spawn候補なし | slotとcountを変えず既存1000ms retryを使う |
| Boss Nightより前のBoss撃破 | 無視する |
| terminal後のevent | pure関数は同じstateを返し、runtime guardも副作用を止める |
| 旧generation callback | generation guardで無視する |
| Inventory表示 | player inputだけを抑止し、run clockは進める |

## 7. テスト観点

| レベル | 観点 | 期待結果 |
| --- | --- | --- |
| unit | scheduleから導く8 phase境界 | 順序、phase ID、表示、残りが一致する |
| unit | Boss Night到達 | playingを維持し、残りは`null`、時間でvictoryにならない |
| unit | Boss撃破 | Boss Nightだけvictory、それ以前とterminal後は無副作用 |
| unit | defeat/retry | schedule維持、elapsed/kills/slotの決定的初期化 |
| unit | enemy event | spawn/death/recycleのcountとkillsが既存契約どおり |
| E2E | DEV queryとphase | 採用値、Night 1 lifecycle、HUD、paletteが同期する |
| E2E | UI中の進行 | Inventory中もphaseが進み、射撃は抑止される |
| E2E | Boss/terminal/retry | Boss Nightで止まり、明示撃破後だけvictory、retryでDay 1へ戻る |

## 8. 対象外と変更履歴

Boss entity、Boss AI/HP、夜ごとの敵構成・数、報酬、汎用director、production設定、multiplayer、persistenceは対象外とする。Boss gameplayはIssue #79、敵構成は後続Issueで接続する。

| 日付 | 変更内容 | 理由 |
| --- | --- | --- |
| 2026-08-09 | combat/rest scheduleへ更新 | Issue #58の追加時間契約 |
| 2026-08-12 | enemy-free preparationへ更新 | Issue #71の条件変更 |
| 2026-08-22 | 3昼夜、Final Day、Boss Nightへ更新 | Issue #78のRunState契約 |
