---
id: SPEC-WAVE-PROGRESSION
requirements: REQ-WAVE-PROGRESSION
---

# wave-progression-v1 仕様

## scheduleと時間進行

scheduleを`C = combatWaveDurationMs`、`R = restDurationMs`、run開始時刻を`startedAt`、Phaser現在時刻を`now`、RunStateの絶対経過時間を`elapsedMs`とする。既定は`C=150000`、`R=60000`、初回準備を含む`runDuration=3C+3R=630000`である。

~~~text
elapsedMs = min(runDuration, max(previousElapsedMs, floor(now - startedAt)))
preparationDuration = R
combatElapsed = max(0, elapsedMs - preparationDuration)
cycleDuration = C + R
wave = min(3, floor(combatElapsed / cycleDuration) + 1)
cycleElapsed = combatElapsed % cycleDuration
phase = elapsedMs >= runDuration ? terminal : elapsedMs < R ? preparation : cycleElapsed < C ? combat : rest
phaseRemaining = elapsedMs >= runDuration ? 0 : phase == preparation ? R - elapsedMs : phase == combat ? C - cycleElapsed : C + R - cycleElapsed
waveRemaining = phase == combat ? phaseRemaining : 0
~~~

third combat waveには後続restがないため、`elapsedMs >= runDuration`では`wave=3`、`phaseRemaining=0`、`waveRemaining=0`、`status=victory`とする。RunStateは過去時刻へ戻らず、terminalへの`advanceRunState`、spawn、death、recycleは同じstate objectを返す。defeatは現在のelapsedとscheduleを保ったまま`status=defeat`へ遷移し、retryは同じschedule、0ms、playing、kills 0、全slot waitingの独立したRunStateを返す。

| 既定の経過時間 | wave | phase | waveRemaining | phaseRemaining | RunState状態 |
| --- | ---: | --- | --- | --- | --- |
| 0〜59999ms | 1 | preparation | 0ms | 60000〜1ms | playing |
| 60000〜209999ms | 1 | combat | 150000〜1ms | 150000〜1ms | playing |
| 210000〜269999ms | 1 | rest | 0ms | 60000〜1ms | playing |
| 270000〜419999ms | 2 | combat | 150000〜1ms | 150000〜1ms | playing |
| 420000〜479999ms | 2 | rest | 0ms | 60000〜1ms | playing |
| 480000〜629999ms | 3 | combat | 150000〜1ms | 150000〜1ms | playing |
| 630000ms以上 | 3 | terminal | 0ms | 0ms | victory |

## DEV schedule query

browserがDEV環境のときだけ、既存spawn queryと同じ`URLSearchParams`と安全な整数正規化で次を解決する。

| query | 採用範囲 | 既定 | HUD観測 |
| --- | --- | --- | --- |
| `combatWaveDurationMs` | 1000〜300000の安全な整数 | 150000 | `[data-testid="run-panel"] data-run-config` |
| `restDurationMs` | 500〜120000の安全な整数 | 60000 | `[data-testid="run-panel"] data-run-config` |

欠落、範囲外、非整数、有限でない値はそれぞれの既定へ戻す。productionではqueryを採用せず、既定scheduleを使う。`data-run-config`は`combatWaveDurationMs=<C>;restDurationMs=<R>`の順で表示する。

## 純粋状態と敵event

`RunState`は`status`、`schedule`、`elapsedMs`、`kills`、12個の`enemySlots`を持つ。slot状態は`waiting`、`active`、`respawning`、`recycling`のいずれかとする。goalは`ENEMY_INSTANCE_IDS`と同じ固定12であり、RunStateに可変quotaを持たせない。

| event | 前提 | slot遷移 | current / remaining | kills |
| --- | --- | --- | --- | --- |
| spawn成功 | playingかつactive以外 | waiting、respawning、recycling → active | 1増加 | 不変 |
| death | playingかつactive | active → respawning | 1減少 | 1増加 |
| hidden recycle開始 | playingかつactive | active → recycling | 1減少 | 不変 |
| strict候補不足 | spawn失敗 | 変更なし | 変更なし | 変更なし |
| retry | terminalまたはplaying | 全slot → waiting | 0 | 0 |

`current`は`activeEnemyCount`、`remaining`は`remainingEnemyCount`で返すactiveかつ未撃破の実数とする。death eventはCombatStateの撃破処理と同じ経路で直ちにslotを`respawning`へ移すので、現行sliceのcurrentとremainingは同じ値になる。`remaining`をgoal不足数または撃破quotaとして表示しない。

pure helperは`currentRunPhase`、`remainingPhaseMs`、`currentWaveNumber`、`remainingWaveMs`、`runDurationMs`を提供する。`currentRunPhase`は`preparation`、`combat`、`rest`を返す。敵通常移動倍率はcombatで1.5、restで0.75、hidden recycleの安全path距離閾値はcombatで10 tile未満、restで5 tile未満とする。preparationにはactive enemyがいない。

## Phaser adapter

`Arena.reset`はDEV queryを一度解決したscheduleを保ち、`retryCombat`と`retryRun(schedule)`、既存の`survivalStartedAt`、generation、map、enemy lifecycle開始済みフラグ、combat epochを初期化する。resetはinitial/stagger timerを作らない。毎frameの`updateSurvival`は`status=playing && elapsedMs >= schedule.restDurationMs`を初回combat epochの到達条件とし、current phaseがcombat以外でも未開始なら一度だけ`startEnemyLifecycle`を呼ぶ。そこで`survivalStartedAt + restDurationMs`をcombat epochとして保持し、initial 8、strict retry、stagger timerを開始する。これによりpreparationから最初のrestへ大きく進んだupdateでもlifecycleを開始できる。`spawnEnemy`、schedule callback、retry callbackは開始済みフラグ、generation、terminalを確認し、初回combat epoch前または古いrunからenemyをspawnしない。`spawnEnemy`がstrict selectorを通ってspriteを有効化した直後に`recordEnemySpawned`を呼ぶ。strict候補不足で`spawnEnemy`がfalseを返す場合はRunStateを変更せず、既存の1000ms再試行を使う。

Arenaの毎frame更新とdynamicな`runDurationMs(schedule)` TimerEventはともに`advanceRunState`を呼ぶ。RunStateがvictoryになったときだけ既存`advanceSurvivalState`と共通terminal処理へ進む。defeatの共通terminal処理は`defeatRun`を呼ぶ。terminalは既存のtimer停止、velocity停止、bullet無効化、physics pause、result表示を維持する。

敵の通常移動はhit-stopとknockbackのearly return後にphase倍率を使う。basicは最終追跡velocityへ、droneは前進velocityと横移動velocityを合成した最終velocityへ一度だけ倍率を掛ける。player、射撃、death respawn、ammo/reload、victoryにはphaseによる停止や倍率を加えない。combat開始後のrestは既存enemy lifecycleを継続し、enemy-freeなのは初回preparationだけである。

`updateMapPalette`はphaseが変わったときだけ、現在のground/wall graphicsを残したままcombatの既存暗い寒色またはpreparation/restの暖色のgraphicsを450msでfade-inし、完了後に前のgraphicsを破棄する。wallのstatic physics groupはmap reset時だけ構築し、palette遷移では再利用する。初回combat epochの到達だけはenemy lifecycleを開始し、同じframeがすでにrestを示していてもその一度だけを許可する。それ以後のwave/phase境界でspawn phase、主方向、active sprite、path、HP、CombatState、enemy metadataを変更しない。既存の`spawnPhaseAt`とdirectional spawnはcombat epochを基準に次回のinitial/stagger/death/recycle/DEV spawnだけに使い、run phaseを入力にしない。

## HUD契約

既存の`survival-time`、`spawn-phase`、`primary-direction`、HP、ammo、敵HP、result、retryのdata-testidを維持する。visibleな総survival残りと敵数は表示しない。

| data-testid / 属性 | 表示値 | 補助属性 |
| --- | --- | --- |
| `wave` | 1始まりのwave番号。rest中は直前combat waveを維持 | `data-state`にplaying、victory、defeat |
| `survival-panel` | 画面中央上のvisibleコンテナ。wave、夜/昼、phase残りを表示 | なし |
| `survival-time` | 合計run残りの互換output | hidden |
| `wave-remaining` | 既存観測契約を保つ互換用output。combatの`MM:SS`残り、restとterminalは00:00 | hidden。visible表示は`phase-remaining`に集約 |
| `run-phase` | preparationは`昼（準備）`、combatは`夜（戦闘）`、restは`昼（休憩）` | `data-phase`にpreparation、combat、rest |
| `phase-remaining` | 現phaseの`MM:SS`残り | なし |
| `run-panel` | 右上のkillsコンテナ | `data-phase`、`data-run-config` |
| `enemy-current` | spawn成功済みactive slot数の互換output | hidden |
| `enemy-goal` | 固定12の互換output | hidden |
| `enemy-remaining` | activeかつ未撃破の敵数の互換output | hidden |
| `kills` | 右上に表示するrun累積death数 | なし |

`ArenaHud.refresh`と毎frameの時間更新は同じRunStateからHUDを更新する。initial、stagger、death、recycle、retry、terminalでRunStateを変更した経路は、既存のHUD refreshまたは時間更新で表示を同期する。visibleな残り時間は中央の`phase-remaining`へ集約し、`run-panel[data-phase]`のCSSはpreparation/restの昼配色とcombatの夜配色を同期してcanvasのpaletteと同じphaseを示す。

## 既存仕様との移行と繰り延べ

本仕様は[SPEC-SURVIVAL-TIME-LIMIT](survival-time-limit-v1.md)の180000ms期限および旧60000ms wave時間をsupersedeし、initial preparationを含むdynamic scheduleによる630000ms既定へ置き換える。victory、defeat、retry、ammo box規則とterminal guardは維持する。[SPEC-DIRECTIONAL-SPAWN](directional-spawn-v1.md)の60000ms spawn phaseはcombat epochから始まる方向付きspawn専用として維持する。

wave固有の新敵、quota、報酬、drop、敵数12超過、balance scaling、汎用director、production設定化は繰り延べる。rest中も既存enemy lifecycleを継続し、休憩用の停止・報酬・再編成を追加しない。

## 検証期待値

- unit: 既定scheduleの60000/210000/270000/420000/480000/630000msと短いcustom scheduleのwave、phase、remaining、terminalを確認する。過去時刻やterminal後のadvanceはstateを戻さない。
- unit: combat/restの速度倍率とrecycle閾値、初期slot、spawn成功、death、recycle、候補不足相当の無操作、defeat、retryでcurrent、remaining、killsを確認する。
- E2E: valid/invalid DEV schedule query、enemy-free preparation、combat開始時のinitial 8 strict spawn、preparationから最初のrestへ大きく時計を進めても一度だけ始まるenemy lifecycle、initial 8が全て成功済みの場合の3/6/9/12秒stagger成功後のactive 9/10/11/12、候補不足時の実数維持、retry中の古いcallback無効化を確認する。
- E2E: preparation/combat/rest境界で中央のwave・夜/昼・phase remaining、450ms palette fade、data-phaseだけが変わり、combat開始後のactive enemy metadataとHPを保持する。合計survival残りと敵数はhiddenの互換outputに留め、killsは右上に表示する。restではpath距離5 tile以上のhidden敵をrecycleでき、death respawn、victory/defeat/retry、有限ammo、reload、ammo box導線を回帰させない。

本仕様はTypeScript実装と手動で同期する。現行DOCGENはPython sourceだけを対象とするため、DOCGEN検査のPASSをTypeScript同期のPASSへ読み替えず、新しいtransformを追加しない。
