---
id: REQ-WAVE-PROGRESSION
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/58
implementation_task: https://github.com/WFrog2511/2d-coop-survival/issues/58
---

# wave-progression-v1 要件

## 目的とDefinition of Delivery

Issue #58のPrototype standard最小移行として、既存のローカルPhaser/Vite browser prototypeへ、3 combat waveとwave間restを持つ観測可能なrun進行を加える。通信、永続化、外部サービス、新しい依存は使わない。

- 既定のcombat waveは各150000ms（02:30）、wave間restは60000ms（01:00）とする。
- runはwave 1 combat、rest、wave 2 combat、rest、wave 3 combatの順で進め、wave 3後にrestを作らない。既定の総時間は `3 * 150000 + 2 * 60000 = 570000ms`（09:30）である。
- enemyのstable slot目標は12体を上限とする。初期8体、3000/6000/9000/12000msのstagger、death respawn、hidden recycle、directional spawnを全phaseで維持する。
- restは敵を停止・追加・置換するintermissionではない。wave固有の新敵、quota、報酬、drop、敵数増加は追加しない。

DEV環境だけではURL query `combatWaveDurationMs` と `restDurationMs` で各時間を上書きできる。正の安全な整数で、combatは1000〜300000ms、restは500〜120000msだけを採用し、それ以外、欠落、非整数は既定値へ戻す。採用値はHUDの`data-run-config`で観測可能にする。production用の設定基盤にはしない。

## RunState、phase、HUDの必須範囲

run開始からの絶対経過時間、schedule、terminal、敵slot、累積撃破数を純粋なRunStateで保持する。Phaserの時刻、sprite、TimerEvent、mapはRunStateへ直接持ち込まない。

既定scheduleの表示進行は次のとおりとする。

| 経過時間 | wave | phase | phase残り | wave残り |
| --- | ---: | --- | --- | --- |
| 0〜149999ms | 1 | 戦闘 | 02:30〜00:01 | 02:30〜00:01 |
| 150000〜209999ms | 1 | 休憩 | 01:00〜00:01 | 00:00 |
| 210000〜359999ms | 2 | 戦闘 | 02:30〜00:01 | 02:30〜00:01 |
| 360000〜419999ms | 2 | 休憩 | 01:00〜00:01 | 00:00 |
| 420000〜569999ms | 3 | 戦闘 | 02:30〜00:01 | 02:30〜00:01 |
| 570000ms以上 | 3 | terminal | 00:00 | 00:00 |

- `current`はspawn成功済みでactiveなstable enemy slotの実数、`goal`は固定12、`remaining`はactiveかつ未撃破の実数、`kills`はrun内death event累積値とする。
- hidden recycleはHPを維持する再投入であり、`kills`を増やさない。combatではpath距離が10 tile未満、restでは5 tile未満のhidden敵をrecycle対象にする。
- spawn候補不足中はactive数、remaining数、killsを変更せず、既存の1000ms retryで成功を待つ。spawn成功したときだけactiveへ遷移する。
- HUDは既存のHP、ammo、spawn phase、result、data-testidを維持する。画面中央上のvisible表示はwave番号、夜（combat）/昼（rest）、現在phase残りだけへ集約し、合計survival残りと`current/goal/remaining`は互換用のhidden outputとする。killsは従来の右上位置に表示し、run panelは`data-phase="combat"|"rest"`を同期する。

phaseにより敵の通常移動だけを倍率変更する。combatは1.5倍、restは0.75倍とし、player操作、射撃、spawn/stagger、death respawn、ammo/reload、victoryは継続する。droneは前進と横移動を合成した最終velocityへ一度だけ倍率を掛ける。hit-stopとknockbackの既存経路は倍率変更しない。mapはcombatで既存の暗い寒色、restで昼寄りの暖色へ切り替え、ground/wall graphicsだけをphase遷移時に450msのクロスフェードで再描画する。static collisionは再生成しない。

## 既存sliceからの移行境界

本要件は[REQ-SURVIVAL-TIME-LIMIT](survival-time-limit-v1.md)の180000ms（03:00）生存期限と、旧wave-progression-v1の各60000ms combat waveをsupersedeする。victory/defeatのterminal停止、retry、ammo box respawn、既存のCombatState導線は維持し、期限だけをRunState scheduleから動的に求める。

[REQ-DIRECTIONAL-SPAWN](directional-spawn-v1.md)の60000ms spawn phase、4方向、initial 8体、段階投入、strict spawn、death respawn、hidden recycleは維持する。spawn phaseとrun phaseは同じrun開始時刻を使っても別の規則であり、run phase境界でactive enemyの位置、HP、stable ID、spawn metadataを変更しない。

## terminalとretry

victoryまたはdefeatでは既存の敵spawn、death、recycle、reload、ammo box、生存timerを停止する。terminal後にRunStateのenemy eventや時刻進行でHUD、sprite、killsを変更してはならない。retryは採用済みscheduleを保つ新しいrunとしてelapsed、phase、wave、敵slot、killsを初期化し、map、initial 8、stagger、HUD、result導線を既存経路で初期化する。

初期化時のactive、current、remainingはstrict spawn成功済みslotの実数であり、候補不足を12または初期8で埋めない。initial 8のstrict spawnがすべて成功した時点では8となる。

## 受け入れ条件

1. 起動直後およびretry直後は、採用済みscheduleでelapsed 0、wave 1、combat、phase残り02:30、kills 0となる。画面中央上には`Wave 1`、`夜（戦闘）`、phase残り02:30を表示し、既定なら09:30の合計survival残り、goal 12、current、remainingはhiddenの互換outputで保持する。互換用`wave-remaining`もcombat中は02:30となる。active、current、remainingは成功済みspawnの実数であり、initial 8のstrict spawnが全て成功した時点で8となる。候補不足時はその実数を維持して1000ms再試行する。
2. 既存の3000/6000/9000/12000msの各stagger spawnが成功するたびに、active、current、remainingはその時点の実数から1だけ増える。initial 8が全て成功済みの場合に限り、各成功後は8→9→10→11→12へ到達する。候補不足時はgoalまたはkillsを変えず、その時点の実数を維持する。
3. 既定scheduleでは150000msでwave 1 rest、210000msでwave 2 combat、360000msでwave 2 rest、420000msでwave 3 combatへ進む。境界でactive enemyの位置、HP、stable ID、spawn metadataを変更しない。combat/restで敵通常速度、hidden recycle閾値、450msでクロスフェードするmap配色だけを切り替える。
4. hidden recycle中は対象slotだけが一時的にcurrent/remainingから外れ、re-entry成功後に戻る。recycle前後でkillsは不変とする。combatはpath距離10 tile未満、restは5 tile未満を安全閾値とする。
5. 敵撃破時は対象slotがcurrent/remainingから外れ、killsが1だけ増える。death respawn成功時はHPを回復してcurrent/remainingへ戻し、killsは維持する。
6. 有効なDEV queryは採用時間、dynamic総時間、phase境界、HUDの`data-run-config`へ反映する。無効なqueryは既定の150000/60000msへ戻る。
7. 既定なら570000msのwave 3 combat終了でwave残り/phase残り/生存残り00:00、victory terminalとなり、wave 3後のrestを開始しない。defeatもRunStateをterminalへ遷移し、retry後は採用scheduleのelapsed 0、wave 1 combat、active実数/12、kills 0へ戻る。

## 対象外と繰り延べ判断

wave固有の新敵、enemy type変更、敵数増加、撃破quota、wave報酬、drop、balance scaling、汎用wave director、production設定、multiplayer sync、persistence、新規依存は対象外とする。固定12 slotと既存spawn契約を超えるgameplay判断は、利用者確認または別Issueで受け入れ条件を合意してから扱う。

TypeScriptの設計同期は手動reviewと対象unit/E2Eで行う。現行DOCGENはPython sourceだけを対象とするため、新しいTypeScript DOCGEN transformは追加しない。技術検証のPASSは顧客またはプロジェクトオーナーの承認を意味しない。

## 検証

- rules unitでschedule、combat/rest境界、動的terminal、速度/recycle helper、spawn/death/recycle、current/remaining/kills、defeat、retryの純粋遷移を確認する。
- Playwright ChromiumでDEV query、初期状態、stagger、phase境界のpalette fade/data-phase、中央のwave・夜/昼・phase残り、hidden互換output、右上kills、rest recycle、death respawn、victory、defeat、retryのHUD/data-testidを確認する。
- 文書変更後はdocs link検査を実行する。
