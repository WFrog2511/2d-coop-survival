---
id: SPEC-WAVE-PROGRESSION
requirements: REQ-WAVE-PROGRESSION
---

# wave-progression-v1 仕様

## scheduleと時間進行

scheduleを`C = combatWaveDurationMs`、`R = restDurationMs`、run開始時刻を`startedAt`、Phaser現在時刻を`now`、RunStateの絶対経過時間を`elapsedMs`とする。既定は`C=150000`、`R=60000`、`runDuration=3C+2R=570000`である。

~~~text
elapsedMs = min(runDuration, max(previousElapsedMs, floor(now - startedAt)))
cycleDuration = C + R
wave = min(3, floor(elapsedMs / cycleDuration) + 1)
cycleElapsed = elapsedMs % cycleDuration
phase = elapsedMs >= runDuration ? terminal : cycleElapsed < C ? combat : rest
phaseRemaining = elapsedMs >= runDuration ? 0 : phase == combat ? C - cycleElapsed : C + R - cycleElapsed
waveRemaining = phase == combat ? phaseRemaining : 0
~~~

third combat waveには後続restがないため、`elapsedMs >= runDuration`では`wave=3`、`phaseRemaining=0`、`waveRemaining=0`、`status=victory`とする。RunStateは過去時刻へ戻らず、terminalへの`advanceRunState`、spawn、death、recycleは同じstate objectを返す。defeatは現在のelapsedとscheduleを保ったまま`status=defeat`へ遷移し、retryは同じschedule、0ms、playing、kills 0、全slot waitingの独立したRunStateを返す。

| 既定の経過時間 | wave | phase | waveRemaining | phaseRemaining | RunState状態 |
| --- | ---: | --- | --- | --- | --- |
| 0〜149999ms | 1 | combat | 150000〜1ms | 150000〜1ms | playing |
| 150000〜209999ms | 1 | rest | 0ms | 60000〜1ms | playing |
| 210000〜359999ms | 2 | combat | 150000〜1ms | 150000〜1ms | playing |
| 360000〜419999ms | 2 | rest | 0ms | 60000〜1ms | playing |
| 420000〜569999ms | 3 | combat | 150000〜1ms | 150000〜1ms | playing |
| 570000ms以上 | 3 | terminal | 0ms | 0ms | victory |

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

pure helperは`currentRunPhase`、`remainingPhaseMs`、`currentWaveNumber`、`remainingWaveMs`、`runDurationMs`を提供する。敵通常移動倍率はcombatで1.5、restで0.75、hidden recycleの安全path距離閾値はcombatで10 tile未満、restで5 tile未満とする。

## Phaser adapter

`Arena.reset`はDEV queryを一度解決したscheduleを保ち、`retryCombat`と`retryRun(schedule)`、既存の`survivalStartedAt`、generation、map、initial 8、stagger timerを初期化する。`spawnEnemy`がstrict selectorを通ってspriteを有効化した直後に`recordEnemySpawned`を呼ぶ。strict候補不足で`spawnEnemy`がfalseを返す場合はRunStateを変更せず、既存の1000ms再試行を使う。

Arenaの毎frame更新とdynamicな`runDurationMs(schedule)` TimerEventはともに`advanceRunState`を呼ぶ。RunStateがvictoryになったときだけ既存`advanceSurvivalState`と共通terminal処理へ進む。defeatの共通terminal処理は`defeatRun`を呼ぶ。terminalは既存のtimer停止、velocity停止、bullet無効化、physics pause、result表示を維持する。

敵の通常移動はhit-stopとknockbackのearly return後にphase倍率を使う。basicは最終追跡velocityへ、droneは前進velocityと横移動velocityを合成した最終velocityへ一度だけ倍率を掛ける。player、射撃、spawn/stagger、death respawn、ammo/reload、victoryにはphaseによる停止や倍率を加えない。

`updateMapPalette`はphaseが変わったときだけgroundとwall graphicsをclearしてcombatの既存暗い寒色またはrestの暖色で再描画する。wallのstatic physics groupはmap reset時だけ構築し、palette遷移では再利用する。wave/phase境界でspawn phase、主方向、active sprite、path、HP、CombatState、enemy metadataを変更しない。既存の`spawnPhaseAt`とdirectional spawnは次回のinitial/stagger/death/recycle/DEV spawnだけに使い、run phaseを入力にしない。

## HUD契約

既存の`survival-time`、`spawn-phase`、`primary-direction`、HP、ammo、敵HP、result、retryのdata-testidを維持する。

| data-testid / 属性 | 表示値 | 補助属性 |
| --- | --- | --- |
| `wave` | 1始まりのwave番号。rest中は直前combat waveを維持 | `data-state`にplaying、victory、defeat |
| `wave-remaining` | 既存観測契約を保つ互換用output。combatの`MM:SS`残り、restとterminalは00:00 | hidden。visible表示は`phase-remaining`に集約 |
| `run-phase` | `戦闘`または`休憩` | `data-phase`にcombatまたはrest |
| `phase-remaining` | 現phaseの`MM:SS`残り | なし |
| `run-panel` | run HUDコンテナ | `data-phase`、`data-run-config` |
| `enemy-current` | spawn成功済みactive slot数 | なし |
| `enemy-goal` | 固定12 | なし |
| `enemy-remaining` | activeかつ未撃破の敵数 | なし |
| `kills` | run累積death数 | なし |

`ArenaHud.refresh`と毎frameの時間更新は同じRunStateからHUDを更新する。initial、stagger、death、recycle、retry、terminalでRunStateを変更した経路は、既存のHUD refreshまたは時間更新で表示を同期する。visibleな残り時間は`phase-remaining`へ集約し、`run-panel[data-phase]`のCSSはcombat/rest配色を同期してcanvasのpaletteと同じphaseを示す。

## 既存仕様との移行と繰り延べ

本仕様は[SPEC-SURVIVAL-TIME-LIMIT](survival-time-limit-v1.md)の180000ms期限および旧60000ms wave時間をsupersedeし、dynamic scheduleによる570000ms既定へ置き換える。victory、defeat、retry、ammo box規則とterminal guardは維持する。[SPEC-DIRECTIONAL-SPAWN](directional-spawn-v1.md)の60000ms spawn phaseは方向付きspawn専用として維持する。

wave固有の新敵、quota、報酬、drop、敵数12超過、balance scaling、汎用director、production設定化は繰り延べる。rest中も既存enemy lifecycleを継続し、休憩用の停止・報酬・再編成を追加しない。

## 検証期待値

- unit: 既定scheduleの150000/210000/360000/420000/570000msと短いcustom scheduleのwave、phase、remaining、terminalを確認する。過去時刻やterminal後のadvanceはstateを戻さない。
- unit: combat/restの速度倍率とrecycle閾値、初期slot、spawn成功、death、recycle、候補不足相当の無操作、defeat、retryでcurrent、remaining、killsを確認する。
- E2E: valid/invalid DEV schedule query、initial 8のstrict spawn成功後のactive 8、initial 8が全て成功済みの場合の3/6/9/12秒stagger成功後のactive 9/10/11/12、候補不足時の実数維持を確認する。
- E2E: combat/rest境界でphase HUD、remaining、palette/data-phaseだけが変わり、active enemy metadataとHPを保持する。restではpath距離5 tile以上のhidden敵をrecycleでき、death respawn、victory/defeat/retry、有限ammo、reload、ammo box導線を回帰させない。

本仕様はTypeScript実装と手動で同期する。現行DOCGENはPython sourceだけを対象とするため、DOCGEN検査のPASSをTypeScript同期のPASSへ読み替えず、新しいtransformを追加しない。
