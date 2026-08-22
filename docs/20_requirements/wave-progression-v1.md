---
id: REQ-WAVE-PROGRESSION
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/78
implementation_task: https://github.com/WFrog2511/2d-coop-survival/issues/78
---

# wave-progression-v1 要件

## 目的とDefinition of Delivery

Issue #78のPrototype standard最小sliceとして、1 runを3回の昼夜、最終昼、Boss Nightへ進める。通常Nightは敵が残っていても時間で終了し、Boss Nightだけは時間で勝利させない。既存のローカルPhaser/Vite browser prototype、12個のstable enemy slot、terminal/retryを再利用し、Boss本体、夜ごとの敵構成、通信、永続化、新規依存は追加しない。

既定進行は次の順とする。時間は試遊用の外出し値であり、値そのものを固定期待値とするunit testは作らない。

| phase ID | 表示 | 既定時間 |
| --- | --- | ---: |
| `day-1` | 昼1（探索） | 150000ms |
| `night-1` | 夜1（戦闘） | 120000ms |
| `day-2` | 昼2（準備） | 75000ms |
| `night-2` | 夜2（戦闘） | 150000ms |
| `day-3` | 昼3（準備） | 75000ms |
| `night-3` | 夜3（戦闘） | 180000ms |
| `final-day` | 最終昼（ボス準備） | 120000ms |
| `boss-night` | ボス夜 | 時間制限なし |

時間制phaseの既定合計は870000ms（14:30）であり、この境界でBoss Nightへ入る。Boss NightはBoss撃破eventでだけvictoryへ遷移する。Boss本体と撃破eventのgameplay接続はIssue #79の範囲とし、このsliceではDEV用接続点を持つ。

## RunStateとgameplay境界

- run開始からの絶対経過時間、7つの時間制phase、Boss Night、terminal、敵slot、累積撃破数を純粋なRunStateで保持する。Phaser object、TimerEvent、mapはRunStateへ直接持ち込まない。
- Day 1は敵をspawnしない探索時間とする。既存enemy lifecycle、initial/stagger、directional spawn epochはNight 1開始時に一度だけ始める。
- 通常Nightの終了条件は時間だけとし、active enemyの残数、撃破数、spawn候補不足によって進行を止めない。
- Day/Night境界では既存active enemyの位置、HP、stable ID、spawn metadataを変更しない。夜ごとの敵数・種類の変更は別Issueとする。
- 昼夜で敵の基礎速度は変更しない。hidden recycleの安全距離だけDayは5 tile、NightとBoss Nightは10 tileとする。
- InventoryなどのUIを開いてもrun時間は停止しない。victory/defeat terminalだけが時間、敵event、射撃、物理を止める。
- defeatは現在のphaseからterminalへ遷移する。retryは同じscheduleを保ち、Day 1、elapsed 0、kills 0、全enemy slot waitingへ決定的に戻す。

## HUDと調整値

- 中央上のHUDは`Day/Night/Boss`に対応するphase名と現在phase残りを表示する。通常NightはWave 1〜3、最終昼は`FINAL`、Boss Nightは`BOSS`を表示する。
- Boss Nightは時間制限がないため、phase残りを`--:--`と表示する。
- run panelは`data-phase="day"|"night"|"boss-night"`、`data-phase-id`、採用した7つの時間を`data-run-config`へ同期する。
- kills、HP、ammo、spawn phase、result、既存のhidden互換outputは維持する。
- 調整値の正本は`src/run-data.ts`とし、手動試遊で調整する。DEV環境だけは各schedule keyと既存互換の`combatWaveDurationMs`、`restDurationMs`をURL queryから採用できる。各値は500〜300000msの安全な整数だけを採用する。

## 受け入れ条件

1. 起動直後とretry直後はDay 1、playing、elapsed 0、kills 0、active enemy 0となり、中央HUDへ`昼1（探索）`と残り時間を表示する。
2. scheduleから導いた各境界でDay 1 → Night 1 → Day 2 → Night 2 → Day 3 → Night 3 → Final Day → Boss Nightの順に進み、時刻が過去へ戻ってもphaseは巻き戻らない。
3. Night 1開始時だけ既存enemy lifecycleを一度開始する。以後のphase境界とUI開閉でactive enemyの位置、HP、metadataを初期化しない。
4. 通常Nightは敵が残っていてもschedule境界で次のDayへ進む。時間制phase合計へ到達してもvictoryにせず、Boss Nightのplayingで止まる。
5. Boss Nightより前のBoss撃破eventは無効であり、Boss Night中のBoss撃破eventだけがRunStateとCombatStateをvictoryへ揃える。
6. defeatまたはvictory後は既存terminal guardが全callbackを止める。retry後は同じscheduleのDay 1へ戻り、前runのcallbackは副作用を与えない。
7. DEV queryの有効値はphase境界と`data-run-config`へ反映し、欠落・非整数・範囲外は該当phaseの既定値へ戻る。productionではqueryを採用しない。
8. Inventoryを開いたままでもphase残りは進行し、射撃抑止、drag-and-drop、retryなど既存操作を壊さない。

## 対象外と検証

Boss entity、Boss AI、Boss HP、夜ごとの敵構成・出現数、報酬、汎用director、production設定、multiplayer sync、persistenceは対象外とする。Boss Nightを自然なgameplayで完了する接続はIssue #79で行う。

- unitはscheduleから境界を導き、8 phase順序、通常Nightの時間終了、Boss撃破だけのvictory、defeat/retry、敵eventの不変条件を確認する。
- PlaywrightはDEV schedule、Night 1開始、phase/HUD/palette、Inventory中の時間進行、Boss Nightでの停止、明示的なBoss撃破、terminal/retryを確認する。
- 調整値そのものの妥当性はプロジェクトオーナーの手動試遊で確認する。
