---
id: DESIGN-BASIC-WAVE-PROGRESSION
requirements: REQ-WAVE-PROGRESSION
specification: SPEC-WAVE-PROGRESSION
---

# wave-progression-v1 基本設計

## 方針と移行境界

既存の`CombatState`、stable enemy ID、Phaser `TimerEvent`、generation、directional spawn、DOM HUDを再利用し、schedule、phase、敵観測だけを小さな純粋`RunState`へ追加する。新しいdependency、wave director、汎用設定、gameplay層は作らない。

本設計は旧180000ms（03:00）survivalと3つの60000ms waveを、enemy-freeの初回準備、3 combat wave各150000ms、間の2 rest各60000ms、既定630000ms（10:30）のscheduleへ置き換える。victory/defeatのterminal停止、retry、ammo box respawn、[REQ-DIRECTIONAL-SPAWN](../../20_requirements/directional-spawn-v1.md)の60000ms spawn phaseは維持する。初回準備中だけenemy lifecycleを開始せず、combat開始時にinitial/staggerとdirectional spawn epochを一度だけ開始する。以後のrestは表示、敵通常速度、recycle閾値、map配色だけを切り替え、active敵を停止、再配置、回復、置換しない。

## 責務

| 対象 | 責務 |
| --- | --- |
| `src/rules.ts` | initial preparation、3 combat/2 restのschedule、dynamic run総時間、RunState、12 stable slot、absolute elapsed、phase/wave/remaining、速度/recycle helper、spawn/death/recycle/defeat/retry遷移、current/remaining/kills helper |
| `src/main.ts` | DEV queryを安全にscheduleへ解決する、combat開始でenemy lifecycleを一度だけ開始する、Phaser時刻をRunStateへ渡す、敵通常velocityへphase倍率を一度だけ適用する、phase変更時にmap graphicsを450msでcrossfadeする、terminal/retryでtimerとstateを同期する |
| `src/arena/hud.ts` | RunStateを中央のwave、準備/夜/昼、visibleなphase残り、hidden互換output、右上killsとrun panel datasetへ反映する |
| `index.html` / `style.css` | 既存Canvas overlayを遮らない中央のwave/準備夜昼/phase残り、右上kills、preparation/combat/restのdata-phase CSSを提供する |
| `tests/rules.test.ts` | schedule、preparation/combat/rest境界、速度/recycle helper、純粋event遷移を検証する |
| `e2e/prototype.spec.ts` | query、enemy-free preparation、combat開始時のinitial/stagger、palette/data-phase、rest recycle、death respawn、victory、defeat、retry旧callbackの観測契約を検証する |

## 処理フロー

~~~mermaid
flowchart TD
  reset[run開始またはretry] --> state[retryCombatとretryRun scheduleを作成]
  state --> preparation[enemy-free初回準備]
  preparation --> initial[combat開始でinitial 8をstrict spawn]
  initial --> spawnSuccess{sprite生成成功か}
  spawnSuccess -->|yes| active[RunState slotをactiveへ]
  spawnSuccess -->|no| retrySpawn[既存1000ms retry]
  active --> stagger[既存3/6/9/12秒stagger]
  stagger --> time[毎frameでabsolute elapsedをadvance]
  time --> phase[中央HUDと450ms palette fadeを更新]
  phase --> event{deathまたはrecycleか}
  event -->|death| respawning[slotをrespawning、killsを加算]
  event -->|recycle| recycling[slotをrecycling、killsは不変]
  respawning --> spawnSuccess
  recycling --> spawnSuccess
  phase --> terminal{dynamic run時間またはHP 0か}
  terminal -->|yes| stop[既存timer停止とphysics pause]
  stop --> reset
~~~

## 時間、slot、HUDの整合

`RunSchedule`はcombat時間とrest時間を持ち、`runDurationMs`は初回準備を含む`3 * combat + 3 * rest`で求める。既定では0〜59999msがwave 1 preparation、60000〜209999msがwave 1 combat、210000〜269999msがwave 1 rest、270000〜419999msがwave 2 combat、420000〜479999msがwave 2 rest、480000〜629999msがwave 3 combat、630000ms以上がvictoryとなる。preparation/rest中のwave番号は直前または次のcombat waveを1始まりで示し、`waveRemaining`は00:00、`phaseRemaining`だけを昼時間残りとして更新する。中央HUDはwave、preparation時の昼（準備）、combat時の夜（戦闘）、rest時の昼（休憩）、`phaseRemaining`だけをvisibleにし、合計run残りと敵数はhidden互換output、killsは右上のままとする。

slotは実際のsprite成功を正本にする。initial/stagger/death/recycleのstrict spawn失敗時はslotをactiveへ変更しないので、HUDのcurrent/remainingが候補不足中のsprite数と一致する。deathはCombatStateのHPを0にした後、slotをrespawningへ移してkillsを1増やす。recycleはHPを維持してslotをrecyclingへ移すだけで、killsを増やさない。goalは固定12であり、remainingをgoal不足またはquotaに読み替えない。

combatでは敵通常移動を1.5倍、restでは0.75倍にする。preparationにはactive敵がいない。droneの前進と横移動は合成後の最終velocityへ一度だけ適用する。hit-stopとknockbackは既存のearly returnに残し、倍率を適用しない。hidden recycleのpath距離安全閾値はcombatが10 tile未満、restが5 tile未満である。phase変更では既存graphicsを残してcombatの寒色またはpreparation/restの暖色graphicsを450msでfade-inし、完了時に旧graphicsだけを破棄するため、static collisionを触らない。

## terminalとretry

victoryとdefeatはRunStateのterminalと既存CombatState terminalを同じ`enterTerminal`へ収束させる。そこでsurvival、enemy spawn、recycle、reload、ammo boxのTimerEventを止め、velocity、bullet、physics、resultを既存通り処理する。terminal後のevent関数は同じRunStateを返す。

retryはgenerationを増やして旧callbackを無効化し、`retryCombat`と`retryRun(schedule)`を同時に作る。new map、enemy-free初回準備、HUD、resultを既存経路で再構築する。RunState初期化時はelapsed 0、wave 1、preparation、既定ならwave残り00:00/phase残り01:00、goal 12、kills 0、active/current/remaining 0とする。初回準備終了時にだけinitial 8とstagger timerを開始する。

## 意図的な非実装と再検討条件

restは敵停止、wave固有敵、enemy count変化、quota、報酬、drop、balance scalingを追加しない。production設定、固定12 slotと既存方向spawnを超える内容は、受け入れ条件と利用者確認を持つ別Issueで再検討する。複数モードが異なるscheduleを必要とする、12超過の負荷を実測する、server authorityが必要になる場合だけ、wave directorまたは設定化を検討する。

TypeScriptの詳細同期はこの基本設計、実装差分、unit/E2Eで手動reviewする。現行DOCGENはPython sourceだけを対象とするため、新しいTypeScript DOCGEN transformを追加しない。
