---
id: SPEC-WAVE-PROGRESSION
requirements: REQ-WAVE-PROGRESSION
---

# wave-progression-v1 仕様

## 時間進行

run開始時刻を`startedAt`、Phaserの現在時刻を`now`、RunStateの絶対経過時間を`elapsedMs`とする。Arenaは`now - startedAt`をRunStateへ渡し、RunStateは負値を0、180000ms超過を180000msへ収め、すでに観測した時間より前へ戻らない。

~~~text
elapsedMs = min(180000, max(previousElapsedMs, floor(now - startedAt)))
wave = min(3, floor(elapsedMs / 60000) + 1)
waveRemaining = elapsedMs >= 180000 ? 0 : 60000 - (elapsedMs % 60000)
~~~

| 経過時間 | wave | waveRemaining | RunState状態 |
| --- | --- | --- | --- |
| 0〜59999ms | 1 | 60000〜1ms | playing |
| 60000〜119999ms | 2 | 60000〜1ms | playing |
| 120000〜179999ms | 3 | 60000〜1ms | playing |
| 180000ms以上 | 3 | 0ms | victory |

terminalのRunStateへ`advanceRunState`、spawn、death、recycleを渡した場合は同じstate objectを返し、後続のtimer callbackに副作用を持たせない。defeatは現在のelapsedを保ったまま`status=defeat`へ遷移する。retryは0ms、playing、kills 0、全slot waitingの独立したRunStateを返す。

## 純粋状態と敵event

`RunState`は`status`、`elapsedMs`、`kills`、12個の`enemySlots`を持つ。slot状態は`waiting`、`active`、`respawning`、`recycling`のいずれかとする。goalは`ENEMY_INSTANCE_IDS`と同じ固定12であり、RunStateに可変quotaを持たせない。

| event | 前提 | slot遷移 | current / remaining | kills |
| --- | --- | --- | --- | --- |
| spawn成功 | playingかつactive以外 | waiting、respawning、recycling → active | 1増加 | 不変 |
| death | playingかつactive | active → respawning | 1減少 | 1増加 |
| hidden recycle開始 | playingかつactive | active → recycling | 1減少 | 不変 |
| strict候補不足 | spawn失敗 | 変更なし | 変更なし | 変更なし |
| retry | terminalまたはplaying | 全slot → waiting | 0 | 0 |

`current`は`activeEnemyCount`、`remaining`は`remainingEnemyCount`で返すactiveかつ未撃破の実数とする。death eventはCombatStateの撃破処理と同じ経路で直ちにslotを`respawning`へ移すので、現行sliceのcurrentとremainingは同じ値になる。`remaining`をgoal不足数または撃破quotaとして表示しない。

## Phaser adapter

`Arena.reset`は`retryCombat`と`retryRun`を作り、既存の`survivalStartedAt`、generation、map、初期8体、stagger timerを初期化する。`spawnEnemy`がstrict selectorを通ってspriteを有効化した直後に`recordEnemySpawned`を呼ぶ。strict候補不足で`spawnEnemy`がfalseを返す場合はRunStateを変更せず、既存の1000ms再試行を使う。

敵のHPが0になった経路は、既存のCombatStateとhit stopを維持したまま`recordEnemyDefeated`を呼び、death timerのspawn成功後にslotをactiveへ戻す。hidden recycleはspriteを無効化する直前に`recordEnemyRecycled`を呼び、HPを変更せずre-entry成功後にslotをactiveへ戻す。DEV respawnはactive spriteの位置を入れ替える観測経路なので、current、remaining、killsを変更しない。

Arenaの毎frame更新と180000msのTimerEventはともに`advanceRunState`を呼ぶ。RunStateがvictoryになったときだけ既存`advanceSurvivalState`と共通terminal処理へ進む。defeatの共通terminal処理は`defeatRun`を呼ぶ。terminalは既存のtimer停止、velocity停止、bullet無効化、physics pause、result表示を維持する。

wave境界でspawn phase、主方向、active sprite、path、HP、CombatState、enemy metadataを更新しない。既存の`spawnPhaseAt`とdirectional spawnは次回のinitial/stagger/death/recycle/DEV spawnだけに使い、wave番号を入力にしない。

## HUD契約

既存の`survival-time`、`spawn-phase`、`primary-direction`、HP、ammo、敵HP、result、retryのdata-testidを維持する。次のoutputを追加する。

| data-testid | 表示値 | 補助属性 |
| --- | --- | --- |
| `wave` | 1始まりのwave番号 | `data-state`にplaying、victory、defeat |
| `wave-remaining` | `MM:SS`のwave残り時間 | なし |
| `enemy-current` | spawn成功済みactive slot数 | なし |
| `enemy-goal` | 固定12 | なし |
| `enemy-remaining` | activeかつ未撃破の敵数 | なし |
| `kills` | run累積death数 | なし |

`ArenaHud.refresh`と毎frameの時間更新は同じRunStateからHUDを更新する。initial、stagger、death、recycle、retry、terminalでRunStateを変更した経路は、既存のHUD refreshまたは時間更新で表示を同期する。

## 既存仕様との移行と繰り延べ

[SPEC-SURVIVAL-TIME-LIMIT](survival-time-limit-v1.md)の生存制限、victory、defeat、retry、ammo box規則を維持し、本仕様は時間進行の観測状態だけを限定してsupersedeする。[SPEC-DIRECTIONAL-SPAWN](directional-spawn-v1.md)の60秒phaseは方向付きspawn専用として維持する。両者は同じstartedAtを使うが、wave境界にenemy配置を変更する副作用を追加しない。

wave固有の新敵、intermission、quota、報酬、drop、敵数12超過、balance scaling、汎用director、設定化は繰り延べる。これらは新たなゲームルールまたは顧客確認を必要とするため、本仕様の純粋な観測・表示移行へ含めない。

## 検証期待値

- unit: 59999ms、60000ms、120000ms、179999ms、180000msのwave/status/remainingを確認する。過去時刻やterminal後のadvanceはstateを戻さない。
- unit: 初期slot、spawn成功、death、recycle、候補不足相当の無操作、defeat、retryでcurrent、remaining、killsを確認する。
- E2E: initial 8のstrict spawn成功後のactive 8、初期8体がすべて成功済みの場合の3/6/9/12秒stagger成功後のactive 9/10/11/12、候補不足時の実数維持、wave 2/3境界、recycleのkills不変、death respawnのkills維持、victory/defeat/retryのHUDを確認する。
- E2E: existing directional spawn、有限ammo、reload、ammo box、result導線を回帰させない。

本仕様はTypeScript実装と手動で同期する。現行DOCGENはPython sourceだけを対象とするため、DOCGEN検査のPASSをTypeScript同期のPASSへ読み替えず、新しいtransformを追加しない。
