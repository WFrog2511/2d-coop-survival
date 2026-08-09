---
id: DESIGN-BASIC-WAVE-PROGRESSION
requirements: REQ-WAVE-PROGRESSION
specification: SPEC-WAVE-PROGRESSION
---

# wave-progression-v1 基本設計

## 方針と移行境界

既存の`CombatState`、stable enemy ID、Phaser `TimerEvent`、generation、directional spawn、DOM HUDを再利用し、時間進行と敵観測だけを小さな純粋`RunState`へ追加する。新しいdependency、wave director、汎用設定、gameplay層は作らない。

RunStateは[REQ-SURVIVAL-TIME-LIMIT](../../20_requirements/survival-time-limit-v1.md)の3分survivalを置き換えない。180000msのvictory、terminal停止、retry、ammo box respawnは既存実装を維持し、wave番号とHUDへ同じrun時間を追加して観測可能にする限定移行である。[REQ-DIRECTIONAL-SPAWN](../../20_requirements/directional-spawn-v1.md)の60秒spawn phaseも維持し、wave境界でactive敵を操作しない。

## 責務

| 対象 | 責務 |
| --- | --- |
| `src/rules.ts` | 180000ms、3×60000ms、RunState、12 stable slot、absolute elapsed、spawn/death/recycle/defeat/retry遷移、current/remaining/kills helper |
| `src/main.ts` | Phaser時刻をRunStateへ渡す、spawn成功だけを記録する、death/recycle前にslotを待機化する、terminal/retryで停止とresetを同期する |
| `src/arena/hud.ts` | RunStateをwave、wave残り、敵current/goal/remaining、killsのoutputへ反映する |
| `index.html` / `style.css` | 既存Canvas overlayを遮らないrun panelとdata-testidを追加する |
| `tests/rules.test.ts` | 時間境界と純粋event遷移を検証する |
| `e2e/prototype.spec.ts` | 初期、stagger、wave境界、recycle、death respawn、victory、defeat、retryの観測契約を検証する |

## 処理フロー

~~~mermaid
flowchart TD
  reset[run開始またはretry] --> state[retryCombatとretryRunを作成]
  state --> initial[既存の初期8体をstrict spawn]
  initial --> spawnSuccess{sprite生成成功か}
  spawnSuccess -->|yes| active[RunState slotをactiveへ]
  spawnSuccess -->|no| retrySpawn[既存1000ms retry]
  active --> stagger[既存3/6/9/12秒stagger]
  stagger --> time[毎frameでabsolute elapsedをadvance]
  time --> wave[wave HUDだけを更新]
  wave --> event{deathまたはrecycleか}
  event -->|death| respawning[slotをrespawning、killsを加算]
  event -->|recycle| recycling[slotをrecycling、killsは不変]
  respawning --> spawnSuccess
  recycling --> spawnSuccess
  wave --> terminal{180000msまたはHP 0か}
  terminal -->|yes| stop[既存timer停止とphysics pause]
  stop --> reset
~~~

## 時間、slot、HUDの整合

`advanceRunState`はrun開始からの絶対経過時間を受け、値を0〜180000msに収めて単調増加にする。0〜59999msはwave 1、60000〜119999msはwave 2、120000〜179999msはwave 3、180000ms以上はwave 3のままvictoryとする。`waveRemaining`はterminal前に60000から1ms、terminalでは0msとする。

slotは実際のsprite成功を正本にする。initial/stagger/death/recycleのstrict spawn失敗時はslotをactiveへ変更しないので、HUDのcurrent/remainingが候補不足中のsprite数と一致する。deathはCombatStateのHPを0にした後、slotをrespawningへ移してkillsを1増やす。recycleはHPを維持してslotをrecyclingへ移すだけで、killsを増やさない。goalは固定12であり、remainingをgoal不足またはquotaに読み替えない。

## terminalとretry

victoryとdefeatはRunStateのterminalと既存CombatState terminalを同じ`enterTerminal`へ収束させる。そこでsurvival、enemy spawn、recycle、reload、ammo boxのTimerEventを止め、velocity、bullet、physics、resultを既存通り処理する。terminal後のevent関数は同じRunStateを返す。

retryはgenerationを増やして旧callbackを無効化し、`retryCombat`と`retryRun`を同時に作る。新map、initial 8、stagger timer、HUD、resultを既存経路で再構築する。RunState初期化時はelapsed 0、wave 1、wave残り01:00、goal 12、kills 0とし、active、current、remainingはstrict spawn成功済みslotの実数だけを表示する。これによりold runのdeath/recycle callbackが新しいcurrent、remaining、killsを変えない。

## 意図的な非実装と再検討条件

waveは時間表示と状態遷移だけであり、wave固有の敵、enemy count変化、intermission、quota、報酬、drop、balance scalingを追加しない。固定12 slotと既存方向spawnを超える内容は、受け入れ条件と利用者確認を持つ別Issueで再検討する。複数モードが異なるwave規則を必要とする、12超過の負荷を実測する、server authorityが必要になる場合だけ、wave directorまたは設定化を検討する。

TypeScriptの詳細同期はこの基本設計、実装差分、unit/E2Eで手動reviewする。現行DOCGENはPython sourceだけを対象とするため、新しいTypeScript DOCGEN transformを追加しない。
