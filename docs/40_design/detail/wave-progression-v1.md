---
id: DESIGN-DETAIL-WAVE-PROGRESSION
requirements: REQ-WAVE-PROGRESSION
specification: SPEC-WAVE-PROGRESSION
---

# wave-progression-v1 詳細設計

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | enemy-free初回準備、3 combat wave、2 rest、kills、phase HUD |
| 対応する基本設計 | [DESIGN-BASIC-WAVE-PROGRESSION](../basic/wave-progression-v1.md) |
| 対応する要件 | [REQ-WAVE-PROGRESSION](../../20_requirements/wave-progression-v1.md) |
| 対応する仕様 | [SPEC-WAVE-PROGRESSION](../../30_specs/wave-progression-v1.md) |
| 関連ADR | なし。既存の固定12 slotとdirectional spawnを維持する |
| ステータス | 実装差分と手動同期するPrototype standard slice |
| DOCGEN | TypeScriptのみ。生成ブロックと新規transformを追加しない |

## 1. 目的

既存の180000ms生存runと各60000ms waveを、enemy-free初回準備、3 combat wave各150000ms、wave 1/2後だけのrest各60000ms、既定630000ms runへ移行する。利用者は中央上でwave 1〜3、昼（準備）/夜（戦闘）/昼（休憩）、現在phase残りを、右上でrun累積killsを観測できる。総survival残りと敵数は互換用hidden outputに留める。時間、enemy slot、terminalはPhaser spriteから切り離した純粋RunStateで扱い、unitでschedule境界とevent遷移を固定する。

この設計は[REQ-SURVIVAL-TIME-LIMIT](../../20_requirements/survival-time-limit-v1.md)の旧時間だけをsupersedeし、victory/defeat/retry、terminal停止、ammo box復活を維持する。[REQ-DIRECTIONAL-SPAWN](../../20_requirements/directional-spawn-v1.md)の60000ms directional spawn phaseをrun phaseへ一般化しない。

## 2. 対象外

| 対象外 | 理由 |
| --- | --- |
| wave固有enemy、quota、報酬、drop、敵数増加 | gameplay判断と利用者確認が必要 |
| rest中の敵停止、spawn停止、回復、配置換え | restは速度、recycle、配色、HUDだけを変える最小slice |
| production設定、汎用wave director、strategy abstraction | 固定3 waveとDEV限定queryに不要 |
| multiplayer、persistence、外部サービス | Prototype standardのローカルbrowser範囲外 |
| TypeScript DOCGEN transform | 現行transformはPythonだけで、[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)へ繰り延べ済み |

## 3. 関連ドキュメント

| 種別 | リンク |
| --- | --- |
| 要件定義 | [REQ-WAVE-PROGRESSION](../../20_requirements/wave-progression-v1.md) |
| 仕様 | [SPEC-WAVE-PROGRESSION](../../30_specs/wave-progression-v1.md) |
| 基本設計 | [DESIGN-BASIC-WAVE-PROGRESSION](../basic/wave-progression-v1.md) |
| 旧生存仕様 | [SPEC-SURVIVAL-TIME-LIMIT](../../30_specs/survival-time-limit-v1.md) |
| 既存spawn仕様 | [SPEC-DIRECTIONAL-SPAWN](../../30_specs/directional-spawn-v1.md) |

## 4. 業務ルール

| ルールID | ルール | 根拠 | 未決事項 |
| --- | --- | --- | --- |
| BR-001 | runはenemy-free preparation 60000ms、combat 150000ms、rest 60000ms、combat 150000ms、rest 60000ms、combat 150000msで、総時間は630000msとする | REQ-WAVE-PROGRESSION | 4 wave以降は別Issue |
| BR-002 | restはwave 1/2後だけであり、wave 3 combat終了時はvictoryへ進む | REQ-WAVE-PROGRESSION | なし |
| BR-003 | goalはstable 12 slotで固定し、phase境界でenemy構成を変えない | REQ-WAVE-PROGRESSION | balance変更は別Issue |
| BR-004 | current/remainingはactiveかつ未撃破の実数、killsはdeath累積とする | SPEC-WAVE-PROGRESSION | currentとremainingを将来も分けるか |
| BR-005 | strict spawn候補不足はRunStateのcountを変えず、既存1000ms retryを使う | SPEC-WAVE-PROGRESSION | なし |
| BR-006 | combat/restの敵通常移動倍率は1.5/0.75、recycle安全閾値は10/5 tile未満とする | REQ-WAVE-PROGRESSION | balance測定は別Issue |
| BR-007 | phase変更時だけground/wall graphicsを寒色/暖色へ450msでcrossfadeし、static collisionを再利用する | REQ-WAVE-PROGRESSION | なし |
| BR-008 | terminal後は時間進行・enemy eventを拒否し、retryはscheduleを保って全RunStateを初期化する | REQ-WAVE-PROGRESSION | なし |
| BR-009 | initial 8、stagger、directional spawn epochはpreparation終了時のcombat開始で一度だけ始め、retry中の旧callbackはenemyをspawnしない | REQ-WAVE-PROGRESSION | なし |

## 5. 利用者導線・操作フロー

~~~mermaid
flowchart TD
  start[run開始またはretry] --> preparation[enemy-free初回準備]
  preparation --> initial[combat開始でinitial 8のstrict spawnを予約]
  initial --> spawn{spawn成功か}
  spawn -->|yes| hud1[実active数をHUD表示]
  spawn -->|no| retrySpawn[既存1000ms retry]
  retrySpawn --> spawn
  hud1 --> stagger[既存staggerとenemy event]
  stagger --> state[spawn成功、death、recycleをRunStateへ記録]
  state --> hud2[hidden互換enemy outputと右上killsを更新]
  hud2 --> time[absolute elapsedを毎frame進める]
  time --> phase[preparation/combat/rest、中央HUD、450ms palette fadeを更新]
  phase --> terminal{dynamic run時間またはHP 0か}
  terminal -->|no| spawn
  terminal -->|yes| result[既存result表示とtimer停止]
  result --> retry[再挑戦]
  retry --> start
~~~

| ステップ | 操作者 | 入力 | システム処理 | 出力 |
| ---: | --- | --- | --- | --- |
| 1 | player | run開始または再挑戦 | CombatStateとRunStateを初期化し、enemy-free初回準備を始める | 中央にwave 1、昼（準備）、既定ならphase残り01:00、右上kills 0、hidden互換outputに10:30とactive/current/remaining 0 |
| 2 | system | preparation終了 | initial 8のstrict spawn、stagger、directional spawn epochを一度だけ開始する | initial成功後のcurrent/remainingは8、そこから各stagger成功後は9→10→11→12 |
| 2a | system | strict候補不足 | slotとcurrent/remainingを変更しない | 同じstrict条件で1000ms後に再試行 |
| 3 | system | phase境界 | wave、夜/昼、phase残り、速度、recycle閾値、450ms palette fadeを更新する | active enemyの配置・HP・metadataは不変 |
| 4 | player/system | enemy deathまたはhidden recycle | slotとkillsを規則どおり更新し、既存timerを予約する | current/remainingとkillsを同期する |
| 5 | player | defeatまたはdynamic run終了後に再挑戦 | terminalを停止し新generationを開始する | 同じscheduleの初期HUDと既存導線へ戻る |

## 6. RunState状態遷移

~~~mermaid
stateDiagram-v2
  [*] --> playing
  playing --> playing: advance elapsed < runDuration
  playing --> victory: advance elapsed >= runDuration
  playing --> defeat: player HP == 0
  victory --> playing: retryRun(schedule)
  defeat --> playing: retryRun(schedule)

  state active {
    [*] --> waiting
    waiting --> active: spawn成功
    active --> respawning: death / kills + 1
    active --> recycling: hidden recycle / kills不変
    respawning --> active: death spawn成功
    recycling --> active: recycle spawn成功
  }
~~~

| 状態 | 意味 | 許可する遷移 |
| --- | --- | --- |
| playing | 時間とenemy eventを受け付けるrun | preparation/combat/rest進行、combat開始後のspawn、death、recycle、victory、defeat |
| victory | wave 3 combat終了後のterminal | retryだけ |
| defeat | player HP 0後のterminal | retryだけ |
| waiting | combat開始後のinitialまたはstaggerの未spawn slot | spawn成功だけ |
| active | Phaser上でactiveな未撃破slot | death、recycle |
| respawning | death後の既存timer待ちslot | spawn成功だけ |
| recycling | hidden recycleの既存timer待ちslot | spawn成功だけ |

## 7. データ設計

### 7.1 手書き設計方針

RunStateは`status`、`schedule`、`elapsedMs`、`kills`、`enemySlots`を保持する。`runDurationMs`、`currentRunPhase`、`remainingPhaseMs`、`currentWaveNumber`、`remainingWaveMs`、`activeEnemyCount`、`remainingEnemyCount`は状態から導出する。Phaser object、TimerEvent、map、enemy HP、表示文字列は保持しない。

DEV queryはArena作成時に一度だけ既存の安全な整数readerで解決し、`createRunSchedule`へ渡す。combatは1000〜300000、restは500〜120000の範囲外なら既定150000/60000へ戻る。retryは同じ採用scheduleを再利用し、runtime中にqueryを読み直さない。

`remainingEnemyCount`はactiveかつ未撃破の実数であり、goalまでの不足数ではない。deathを記録する同じScene経路でslotを`respawning`へ変えるため、currentとremainingは現行sliceで同値となる。

### 7.2 DOCGENの扱い

実装対象はTypeScriptであり、現在のDOCGEN transformはPython sourceだけを扱う。この詳細設計には`DOCGEN_TODO`または`DOCGEN`ブロックを置かず、public exportとadapter呼出しは実装差分・unit・E2Eで手動reviewする。

## 8. adapter設計

| 経路 | 呼び出し元 | RunState操作 | 既存責務 |
| --- | --- | --- | --- |
| run開始/retry | `Arena.reset` | `retryRun(schedule)` | generation、map、enemy lifecycle未開始、HUD初期化 |
| combat開始 | `Arena.startEnemyLifecycle` | initial/staggerのspawn成功時に`recordEnemySpawned` | combat epoch、initial 8、strict retry、stagger開始 |
| spawn成功 | `Arena.spawnEnemy` | `recordEnemySpawned` | strict selector、sprite有効化、spawn metadata |
| death | `Arena.scheduleDefeatedEnemy` | `recordEnemyDefeated` | CombatState HP、hit stop、death timer、HP回復respawn |
| recycle | `Arena.updateHiddenRecycle` | `recordEnemyRecycled` | HP維持、recycle timer、re-entry |
| 時間 | `Arena.updateSurvival` | `advanceRunState` | dynamic survival残り、phase、palette、victory判定 |
| 通常移動 | `Arena.moveEnemy` | `currentRunPhase` | final velocityへ倍率を一度だけ適用 |
| defeat | `Arena.enterTerminal` | `defeatRun` | timer停止、physics pause、result表示 |

`ArenaHud`はRunStateから中央のwave、昼（準備）/夜（戦闘）/昼（休憩）、phase残りと右上killsをvisibleに更新する。`survival-time`、`wave-remaining`、current、goal、remainingは既存観測契約用のhidden outputとして維持する。run panelの`data-phase`はcanvas paletteと同じphaseである。map paletteはphase変化だけで、既存`ground`と`wallArt`を残しつつ新しいgraphicsを450ms fade-inしてから入れ替え、static wall collisionを変更しない。spawn phaseとprimary directionはcombat epochからのdirectional spawn観測値であり、RunStateのwaveと混在させない。

## 9. 失敗時動作

| 条件 | 表示/状態 | 回復導線 |
| --- | --- | --- |
| 無効DEV query | 該当値だけ既定scheduleへ戻し、HUD datasetも既定値 | URLを修正して新規runを開始 |
| strict spawn候補なし | slot、current、remaining、killsを変更しない | 既存1000ms retry |
| 同じslotの重複death/recycle | pure関数は同じstateを返す | Sceneが既存timerを維持 |
| terminal後のadvance/spawn/death/recycle | pure関数は同じstateを返す | retryだけを受け付ける |
| 旧generation callback | Scene guardで副作用なし | 新runのstate/HUDを維持 |
| preparation中のspawn callback | enemy lifecycle未開始またはgeneration不一致なら副作用なし | 初回combat開始を待つ |
| phase境界 | 初回preparation→combatではenemy lifecycleを一度開始し、それ以後は中央HUD、速度、recycle閾値、450ms palette fadeだけ更新 | combat開始後のactive enemyの配置・HP・metadataを維持 |

認証、認可、PII、監査ログ、外部APIはこのローカルprototypeの対象外である。

## 10. テスト観点

| レベル | 観点 | 期待結果 |
| --- | --- | --- |
| unit | 既定60000/210000/270000/420000/480000/630000ms | wave、phase、phase/wave残り、terminalが境界どおり |
| unit | 短いcustom schedule | dynamic総時間とwave 3後にrestを作らないこと |
| unit | 速度/recycle helper | combat=1.5/10、rest=0.75/5 |
| unit | spawn/death/recycle | current/remainingとkillsが表どおり、recycleはkills不変 |
| unit | terminal/retry | terminal後は無副作用、retryはscheduleを保って0ms/0 kills/waiting slot |
| E2E | DEV query | valid値をHUD datasetへ反映し、無効値は既定へ戻す |
| E2E | preparation/initial/stagger | 初回準備中はactive 0かつspawn callbackなし。combat開始でinitial 8全成功後に8、各3/6/9/12秒stagger成功後に9→10→11→12。候補不足時は実数を維持して1000ms再試行 |
| E2E | phase/palette/HUD | preparation/combat/rest境界で中央のwave・夜/昼・phase残り、data-phase、450ms palette fadeが変わり、総残り/敵数はhidden、killsは右上のまま、combat開始後のmetadataとHPを保持 |
| E2E | recycle/death | restではpath距離5 tile以上のhidden敵もrecycleでき、death respawn後もkillsを保持 |
| E2E | victory/defeat/retry | dynamic terminal、result、停止、schedule維持、既存ammo/reload導線を維持 |

## 11. 未決事項・人間確認

| ID | 確認事項 | 判断者 | 影響 |
| --- | --- | --- |
| Q-001 | 150秒combatと60秒restの体感が協力survivalに合うか | 顧客またはプロジェクトオーナー | balance/customer-reviewで別途記録 |
| Q-002 | rest中の敵通常速度0.75とrecycle閾値5が安全か | プロジェクトオーナー | 実測後に別balance Issue |
| Q-003 | 将来にwave固有enemy、quota、報酬を導入するか | 顧客またはプロジェクトオーナー | 新しい受け入れ条件と別Issueが必要 |

## 12. 変更履歴

| 日付 | 変更内容 | 理由 |
| --- | --- | --- |
| 2026-08-09 | combat/rest scheduleへ更新 | Issue #58の追加時間契約と手動設計同期のため |
| 2026-08-12 | 初回enemy-free preparationとcombat epochへ更新 | Issue #71の条件変更と手動設計同期のため |
