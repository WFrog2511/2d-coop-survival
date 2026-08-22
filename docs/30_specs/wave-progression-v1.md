---
id: SPEC-WAVE-PROGRESSION
requirements: REQ-WAVE-PROGRESSION
---

# wave-progression-v1 仕様

## scheduleと純粋状態

`RunSchedule`は次の7 keyを持ち、`runDurationMs(schedule)`はその合計、すなわちBoss Night開始時刻を返す。

~~~text
day1DurationMs
night1DurationMs
day2DurationMs
night2DurationMs
day3DurationMs
night3DurationMs
finalDayDurationMs
~~~

phase定義の順序は`day-1`、`night-1`、`day-2`、`night-2`、`day-3`、`night-3`、`final-day`、`boss-night`で固定する。`src/run-data.ts`の既定値は順に150000、120000、75000、150000、75000、180000、120000msである。Boss Nightにはdurationを持たせない。

`advanceRunState(state, elapsedMs)`は`elapsedMs`を0以上の整数へ正規化し、Boss Night開始境界を上限として単調増加させる。時間だけでは`status`をvictoryへ変えない。`currentRunPhaseId`は時間制phaseの区間内なら該当ID、合計境界以後なら`boss-night`を返す。

| helper | 契約 |
| --- | --- |
| `runPhaseStartMs` | 指定phaseまでに先行するschedule値の合計。`boss-night`は7値の合計 |
| `currentRunPhase` | `day`、`night`、`boss-night`のいずれか |
| `currentWaveNumber` | 通常Nightに対応する1〜3。Final Day/Boss Nightは互換用の3 |
| `currentRunPhaseLabel` | phase IDに対応する日本語表示 |
| `remainingPhaseMs` | 現在の時間制phaseの残り。Boss Nightは`null` |
| `remainingWaveMs` | 通常Nightだけphase残り、それ以外は0 |
| `recordBossDefeated` | playingかつBoss Nightならvictory。それ以外は同じstate |
| `defeatRun` | playingをdefeatへ遷移し、scheduleとelapsedを維持 |
| `retryRun` | 同じschedule、elapsed 0、kills 0、全slot waitingの新state |

terminalへのadvance、Boss撃破、spawn、death、recycleは同じstateを返す。`completeCombatVictory`はBoss撃破が確定したadapter経路で既存CombatStateのvictoryを同期する。

## 敵eventとPhaser adapter

`RunState`は`status`、`schedule`、`elapsedMs`、`kills`、12個の`enemySlots`を持つ。slot状態は`waiting`、`active`、`respawning`、`recycling`であり、spawn成功時だけactiveへ進む。deathはrespawningとkills + 1、hidden recycleはrecyclingでkills不変とする。

`Arena.reset`は採用scheduleを保ってRunStateとCombatState、generation、map、enemy lifecycle flagを初期化する。`updateSurvival`は毎frameの絶対経過時間をRunStateへ渡す。`runPhaseStartMs(schedule, 'night-1')`へ初めて到達したときだけ、既存initial/staggerとdirectional spawn epochを開始する。大きな時計進行で境界を飛び越えても開始は一度だけとする。

通常Night終了とDay/Night境界はHUDとpaletteだけを切り替え、active enemyのstate、sprite、path、HP、metadataを変更しない。敵通常速度倍率は全phaseで1とする。hidden recycleのpath距離閾値はDayが5、Night/Boss Nightが10 tileである。

時間制phase合計へ到達するとArenaのrun TimerEventは終了するが、RunStateはBoss Nightのplayingを維持する。DEVの`debugDefeatBoss`はBoss Night中だけ`recordBossDefeated`と`completeCombatVictory`を経由して既存`enterTerminal('victory')`へ入る。defeatは`defeatRun`を経由する。terminalは既存timer停止、velocity停止、bullet無効化、physics pause、result表示を維持する。

## DEV schedule query

DEV環境だけで各`RunSchedule` keyを同名queryから読み、500〜300000の安全な整数だけを採用する。`combatWaveDurationMs`は個別Night keyがない場合のNight共通値、`restDurationMs`は個別Day keyがない場合のDay共通値として後方互換のため維持する。個別keyを優先する。productionではすべて無視する。

`[data-testid="run-panel"]`の`data-run-config`は`Object.entries(schedule)`の順で`key=value`をセミコロン連結した値とする。無効値はそのkeyの`src/run-data.ts`既定値へ戻す。

## HUD契約

| data-testid / 属性 | 契約 |
| --- | --- |
| `wave` | 通常phaseは`1`〜`3`、Final Dayは`FINAL`、Boss Nightは`BOSS` |
| `run-phase` | `currentRunPhaseLabel`の表示。`data-phase`と`data-phase-id`も同期 |
| `phase-remaining` | 時間制phaseは`MM:SS`、Boss Nightは`--:--` |
| `run-panel` | killsと`data-phase`、`data-phase-id`、`data-run-config`を保持 |
| `survival-time` | Boss Night開始までの合計残りを互換用hidden outputとして保持 |
| `wave-remaining` | 通常Nightだけ残り時間、それ以外は00:00のhidden output |
| `enemy-current` / `enemy-goal` / `enemy-remaining` | 既存のhidden enemy outputを維持 |

`data-phase="day"`は昼配色、`night`と`boss-night`は夜配色を使う。ground/wall graphicsはphase種別が変わったときだけ450msでcrossfadeし、static collisionを再構築しない。Inventory overlayはinputを抑止するがScene updateとrun clockを停止しない。

## 移行、対象外、検証期待値

本仕様は[SPEC-SURVIVAL-TIME-LIMIT](survival-time-limit-v1.md)の180000ms期限と、旧preparation/combat/rest scheduleの630000ms自動victoryをsupersedeする。[SPEC-DIRECTIONAL-SPAWN](directional-spawn-v1.md)の4方向、stable slot、strict spawn、death respawn、hidden recycle、generation guardは維持し、そのepochだけをNight 1開始へ移す。

Boss entityと自然なBoss撃破接続、夜ごとのenemy構成、quota、報酬、汎用directorは対象外とする。

- unitはschedule値から全境界を導き、順序、単調進行、Boss Nightの無期限、Boss撃破event、defeat/retry、enemy eventを確認する。
- E2EはDEV query、Day 1のenemy-free、Night 1 lifecycle、phase/HUD/palette、Inventory中の時間進行、Boss Night、明示撃破、terminal/retryを確認する。
- 外出し時間の値そのものを固定するunit期待値は作らない。
