---
id: DESIGN-DETAIL-WAVE-PROGRESSION
requirements: REQ-WAVE-PROGRESSION
specification: SPEC-WAVE-PROGRESSION
---

# wave-progression-v1 詳細設計

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | 3分survival runの3 wave進行、敵数、kills HUD |
| 対応する基本設計 | [DESIGN-BASIC-WAVE-PROGRESSION](../basic/wave-progression-v1.md) |
| 対応する要件 | [REQ-WAVE-PROGRESSION](../../20_requirements/wave-progression-v1.md) |
| 対応する仕様 | [SPEC-WAVE-PROGRESSION](../../30_specs/wave-progression-v1.md) |
| 関連ADR | なし。既存の固定12 slotとdirectional spawnを維持する |
| ステータス | 実装差分と手動同期するPrototype standard slice |
| DOCGEN | TypeScriptのみ。生成ブロックと新規transformを追加しない |

## 1. 目的

3分の既存survival runを、利用者がwave 1〜3、wave残り、現在敵数、固定goal、残敵数、run累積killsとして観測できるようにする。時間、enemy slot、terminalをPhaser spriteから切り離した純粋RunStateで扱い、unitで境界とevent遷移を固定する。

この設計は[REQ-SURVIVAL-TIME-LIMIT](../../20_requirements/survival-time-limit-v1.md)のvictory/defeat/retryを置き換えず、[REQ-DIRECTIONAL-SPAWN](../../20_requirements/directional-spawn-v1.md)の方向付きspawnをwave機構へ一般化しない。

## 2. 対象範囲

### 対象

| 項目 | 内容 |
| --- | --- |
| 対象ユースケース | run開始、initial/stagger spawn、death、hidden recycle、wave境界、victory、defeat、retry |
| 対象画面 | Canvas上のrun panelと既存の診断HUD、result panel |
| 対象データ | RunState、12 stable enemy slot、absolute elapsed、kills |
| 実装境界 | `src/rules.ts`、`src/main.ts`、`src/arena/hud.ts`、`index.html`、`style.css` |

### 対象外

| 項目 | 理由 |
| --- | --- |
| wave固有の新敵、enemy数増加、intermission、quota、報酬、drop | 新しいgameplay判断と利用者確認が必要 |
| wave director、strategy、設定基盤 | 固定3 waveと固定12 slotに不要 |
| multiplayer、persistence、外部サービス | Prototype standardのローカルbrowser範囲外 |
| TypeScript DOCGEN transform | 現行transformはPythonだけで、[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)へ繰り延べ済み |

## 3. 関連ドキュメント

| 種別 | リンク |
| --- | --- |
| 要件定義 | [REQ-WAVE-PROGRESSION](../../20_requirements/wave-progression-v1.md) |
| 仕様 | [SPEC-WAVE-PROGRESSION](../../30_specs/wave-progression-v1.md) |
| 基本設計 | [DESIGN-BASIC-WAVE-PROGRESSION](../basic/wave-progression-v1.md) |
| 既存生存仕様 | [SPEC-SURVIVAL-TIME-LIMIT](../../30_specs/survival-time-limit-v1.md) |
| 既存spawn仕様 | [SPEC-DIRECTIONAL-SPAWN](../../30_specs/directional-spawn-v1.md) |

## 4. 業務ルール

| ルールID | ルール | 根拠 | 未決事項 |
| --- | --- | --- | --- |
| BR-001 | run全体は180000ms、waveは60000msずつの3つとする | REQ-WAVE-PROGRESSION | wave 4以降は別Issue |
| BR-002 | 180000msではwave 3のままvictory terminalへ進み、wave 4を作らない | REQ-WAVE-PROGRESSION | なし |
| BR-003 | goalはstable 12 slotで固定し、wave境界でenemy構成を変えない | REQ-WAVE-PROGRESSION | balance変更は別Issue |
| BR-004 | current/remainingはactiveかつ未撃破の実数、killsはdeath累積とする | SPEC-WAVE-PROGRESSION | currentとremainingの表示分離を将来も維持するか |
| BR-005 | recycleはHPを保持して一時inactiveにするだけでkillsを増やさない | REQ-WAVE-PROGRESSION | なし |
| BR-006 | strict spawn候補不足はRunStateのcountを変えず既存retryを使う | SPEC-WAVE-PROGRESSION | なし |
| BR-007 | terminal後は時間進行・enemy eventを拒否し、retryは全RunStateを初期化する | REQ-WAVE-PROGRESSION | なし |

## 5. 利用者導線・操作フロー

~~~mermaid
flowchart TD
  start[run開始またはretry] --> initial[initial 8のstrict spawnを予約]
  initial --> spawn{spawn成功か}
  spawn -->|yes| hud1[実active数をHUD表示]
  spawn -->|no| retrySpawn[既存1000ms retry]
  retrySpawn --> spawn
  hud1 --> stagger[既存staggerとenemy event]
  stagger --> state[spawn成功、death、recycleをRunStateへ記録]
  state --> hud2[current/goal/remaining/killsを更新]
  hud2 --> time[absolute elapsedを毎frame進める]
  time --> boundary{60000ms境界か}
  boundary -->|yes| wave[wave表示だけを更新]
  boundary -->|no| terminal
  wave --> terminal{180000msまたはHP 0か}
  terminal -->|no| spawn
  terminal -->|yes| result[既存result表示とtimer停止]
  result --> retry[再挑戦]
  retry --> start
~~~

| ステップ | 操作者 | 入力 | システム処理 | 出力 |
| ---: | --- | --- | --- | --- |
| 1 | player | run開始または再挑戦 | CombatStateとRunStateを初期化し、既存initial 8のstrict spawnを予約する | elapsed 0、wave 1、wave残り01:00、03:00、成功済みspawnの実数/12、kills 0 |
| 2 | system | initialまたはstagger spawn成功 | 対象slotをactiveへ遷移する | current/remainingは成功ごとに1増加する。initial 8がすべて成功後は8、そこから各stagger成功後は9→10→11→12 |
| 2a | system | strict候補不足 | slotとcurrent/remainingを変更しない | 同じstrict条件で1000ms後に再試行 |
| 3 | system | 60000ms境界 | wave番号とwave残りだけを更新する | active enemyは配置・HP不変 |
| 4 | player/system | enemy deathまたはhidden recycle | slotとkillsを規則どおり更新し、既存timerを予約する | current/remainingとkillsを同期する |
| 5 | player | defeatまたは180000ms到達後に再挑戦 | terminalを停止し新generationを開始する | 初期HUDと既存導線へ戻る |

## 6. RunState状態遷移

~~~mermaid
stateDiagram-v2
  [*] --> playing
  playing --> playing: advance elapsed < 180000ms
  playing --> victory: advance elapsed >= 180000ms
  playing --> defeat: player HP == 0
  victory --> playing: retryRun
  defeat --> playing: retryRun

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
| playing | 時間とenemy eventを受け付けるrun | wave進行、spawn、death、recycle、victory、defeat |
| victory | 180000ms到達後のterminal | retryだけ |
| defeat | player HP 0後のterminal | retryだけ |
| waiting | initialまたはstaggerの未spawn slot | spawn成功だけ |
| active | Phaser上でactiveな未撃破slot | death、recycle |
| respawning | death後の既存timer待ちslot | spawn成功だけ |
| recycling | hidden recycleの既存timer待ちslot | spawn成功だけ |

## 7. データ設計

### 7.1 手書き設計方針

RunStateは`status`、`elapsedMs`、`kills`、`enemySlots`だけを保持する。`currentWaveNumber`、`remainingWaveMs`、`activeEnemyCount`、`remainingEnemyCount`は状態から導出し、Phaser object、TimerEvent、map、enemy HP、表示文字列は保持しない。

`remainingEnemyCount`はactiveかつ未撃破の実数であり、goalまでの不足数ではない。deathを記録する同じScene経路でslotを`respawning`へ変えるため、currentとremainingは現行sliceで同値となる。冗長に見えても、HUDの語義を固定し、将来のquotaやwave enemyを暗黙に導入しないために分けて表示する。

### 7.2 DOCGENの扱い

実装対象はTypeScriptであり、現在のDOCGEN transformはPython sourceだけを扱う。この詳細設計には`DOCGEN_TODO`または`DOCGEN`ブロックを置かず、public exportとadapter呼出しは実装差分・unit・E2Eで手動reviewする。

## 8. adapter設計

| 経路 | 呼び出し元 | RunState操作 | 既存責務 |
| --- | --- | --- | --- |
| run開始/retry | `Arena.reset` | `retryRun` | generation、map、initial 8、stagger、HUD初期化 |
| spawn成功 | `Arena.spawnEnemy` | `recordEnemySpawned` | strict selector、sprite有効化、spawn metadata |
| death | `Arena.scheduleDefeatedEnemy` | `recordEnemyDefeated` | CombatState HP、hit stop、death timer、HP回復respawn |
| recycle | `Arena.updateHiddenRecycle` | `recordEnemyRecycled` | HP維持、recycle timer、re-entry |
| 時間 | `Arena.updateSurvival` | `advanceRunState` | survival残り時間、victory判定 |
| defeat | `Arena.enterTerminal` | `defeatRun` | timer停止、physics pause、result表示 |

`ArenaHud`はRunStateからwave、wave残り、current、goal、remaining、killsを更新する。`spawn-phase`と`primary-direction`は引き続きdirectional spawnの観測値であり、RunStateのwaveと混在させない。

## 9. バリデーション・失敗時動作

| 条件 | 表示/状態 | 回復導線 |
| --- | --- | --- |
| strict spawn候補なし | slot、current、remaining、killsを変更しない | 既存1000ms retry |
| 同じslotの重複death/recycle | pure関数は同じstateを返す | Sceneが既存timerを維持 |
| terminal後のadvance/spawn/death/recycle | pure関数は同じstateを返す | retryだけを受け付ける |
| 旧generation callback | Scene guardで副作用なし | 新runのstate/HUDを維持 |
| wave境界 | HUDだけを更新する | active enemyの配置・HPを維持 |

認証、認可、PII、監査ログ、外部APIはこのローカルprototypeの対象外である。

## 10. テスト観点

| レベル | 観点 | 期待結果 |
| --- | --- | --- |
| unit | 59999/60000/120000/179999/180000ms | wave、wave残り、terminalが境界どおり |
| unit | spawn/death/recycle | current/remainingとkillsが表どおり、recycleはkills不変 |
| unit | terminal/retry | terminal後は無副作用、retryは0ms/0 kills/waiting slot |
| E2E | initial/stagger | initial 8がすべてspawn成功後に8。初期8がすべて成功済みの場合、各3/6/9/12秒staggerのspawn成功後に9→10→11→12。候補不足時は実数を維持して1000ms再試行 |
| E2E | wave | 60秒境界で表示だけ進み、existing spawn metadataを保持 |
| E2E | recycle/death | sprite観測数とHUD数が同期し、death respawn後もkillsを保持 |
| E2E | victory/defeat/retry | result、停止、wave、HUD、既存ammo/reload導線を維持 |

## 11. 未決事項・人間確認

| ID | 確認事項 | 判断者 | 影響 |
| --- | --- | --- | --- |
| Q-001 | wave番号だけで位置取り・緊張感を利用者が理解できるか | 顧客またはプロジェクトオーナー | customer-reviewで別途記録 |
| Q-002 | 将来にwave固有enemy、quota、intermission、報酬を導入するか | 顧客またはプロジェクトオーナー | 新しい受け入れ条件と別Issueが必要 |
| Q-003 | currentとremainingを将来も別表示に保つか | プロジェクトオーナー | HUD契約変更を伴う |

## 12. 変更履歴

| 日付 | 変更内容 | 理由 |
| --- | --- | --- |
| 2026-08-09 | 初版作成 | Issue #58の最小wave進行移行を手動設計同期するため |
