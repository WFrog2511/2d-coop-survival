---
id: DESIGN-BASIC-WAVE-PROGRESSION
requirements: REQ-WAVE-PROGRESSION
specification: SPEC-WAVE-PROGRESSION
---

# wave-progression-v1 基本設計

## 方針

Issue #78では既存RunStateを8 phaseへ置き換え、Phaser Sceneを時刻とruntime eventのadapterに留める。7つの時間制phaseは`src/run-data.ts`の外出し値から構築し、Boss Nightは時間で終了させない。Boss entity、夜ごとの敵構成、汎用directorは追加しない。

~~~mermaid
flowchart LR
  d1[Day 1] --> n1[Night 1]
  n1 --> d2[Day 2]
  d2 --> n2[Night 2]
  n2 --> d3[Day 3]
  d3 --> n3[Night 3]
  n3 --> fd[Final Day]
  fd --> bn[Boss Night]
  bn -->|Boss撃破event| win[victory]
  d1 -->|HP 0| lose[defeat]
  n1 -->|HP 0| lose
  bn -->|HP 0| lose
  win -->|retry| d1
  lose -->|retry| d1
~~~

## 責務

| 対象 | 責務 |
| --- | --- |
| `src/run-data.ts` | 7つの手動調整用durationを保持する |
| `src/rules.ts` | schedule正規化、phase境界、単調な時間進行、Boss撃破、defeat/retry、stable enemy slotの純粋遷移 |
| `src/main.ts` | DEV query、Phaser clock、Night 1でのenemy lifecycle開始、palette、terminal/retryのadapter |
| `src/arena/hud.ts` | phase ID/表示/残り、Wave/FINAL/BOSS、killsと互換outputを同期する |
| `index.html` / `style.css` | 初期Day 1表示とday/night/boss-nightの配色を提供する |
| `tests/rules.test.ts` | 調整値から導いたphase順序と状態遷移を検証する |
| `e2e/prototype.spec.ts` | query、runtime境界、HUD、Boss明示撃破、terminal/retryを検証する |

## runtime境界

`RunState`はPhaser objectを持たず、`advanceRunState`へrun開始からの絶対経過時間だけを受け取る。7つのduration合計でelapsedをclampし、Boss Nightのplayingを維持する。Boss撃破eventだけが`recordBossDefeated`でRunStateをvictoryへし、同じadapterでCombatStateをvictoryへ揃える。

ArenaはNight 1開始境界で既存enemy lifecycleを一度だけ開始する。以後のDay/Night境界ではactive enemyを停止、回復、再配置しない。phase差はHUD、map palette、hidden recycle距離だけとし、敵基礎速度は変えない。

run timerはBoss Night開始時に終了し、毎frame updateは継続する。Inventory overlayもclockを停止しない。victory/defeatだけが既存terminal処理へ入り、全timer、bullet、physicsを停止する。retryはgenerationを更新し、旧callbackを無効化して同じscheduleのDay 1へ戻す。

## HUDと設定

中央HUDは通常phaseでWave 1〜3、Final Dayで`FINAL`、Boss Nightで`BOSS`を表示する。phase残りは時間制phaseで`MM:SS`、Boss Nightで`--:--`とする。`data-phase`、`data-phase-id`、`data-run-config`をE2Eの観測面として維持する。

DEV queryは7 keyを個別に上書きできる。旧`combatWaveDurationMs`と`restDurationMs`はE2E互換の共通fallbackに限定する。production設定基盤へ一般化しない。

## 意図的な非実装

Boss entity、Boss HP/AI、Boss撃破drop、夜ごとの敵構成・数、wave報酬、multiplayer、persistenceは別Issueとする。試遊で時間値を変えるだけでunit修正が必要にならないよう、テストはscheduleから期待境界を導く。TypeScript DOCGEN transformは追加せず、設計同期は差分とunit/E2Eで手動reviewする。
