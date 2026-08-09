---
id: REQ-WAVE-PROGRESSION
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/58
implementation_task: https://github.com/WFrog2511/2d-coop-survival/issues/58
---

# wave-progression-v1 要件

## 目的とDefinition of Delivery

Issue #58の最小移行として、既存の3分間生存runを3つの60秒combat waveとして利用者へ観測可能にする。成果物段階はPrototype standardのローカル検証版とし、既存Phaser/Viteブラウザprototypeだけを対象にする。通信、永続化、外部サービスは使わない。

- run全体の制限時間は既存どおり180000msとする。
- wave 1、wave 2、wave 3は各60000msとし、run開始から0〜59999ms、60000〜119999ms、120000〜179999msに対応する。
- 180000msの境界ではwave 4を開始せず、既存のvictory terminalへ遷移する。
- 敵のstable slot目標は既存どおり12体を上限とする。run開始時の初期8体と3000/6000/9000/12000msの段階投入、death respawn、hidden recycle、directional spawnを維持する。
- wave境界は表示と純粋状態だけを更新し、activeな敵を追加、再配置、停止、回復、置換しない。

## RunStateとHUDの必須範囲

run開始からの絶対経過時間、terminal、敵slot、累積撃破数を純粋なRunStateで保持する。Phaserの時刻やspriteはRunStateへ直接持ち込まない。

- `current`はspawn成功済みでactiveなstable enemy slotの実数とする。
- `goal`は固定12とする。これは撃破quotaや次waveの敵数ではない。
- `remaining`はactiveかつ未撃破として残る敵の実数とする。death eventでslotを再出現待ちへ移すため、現行sliceでは`current`と同じ実数になる。
- `kills`はrun内のdeath event累積値とする。hidden recycleはHPを維持する位置の再投入であり、`kills`を増やさない。
- spawn候補が不足して再試行する間は、active数、remaining数、killsを変更しない。spawnが成功したときだけactiveへ遷移する。
- HUDはwave番号、wave残り時間、`current/goal/remaining`、killsを表示し、既存の残り時間、HP、ammo、spawn phase、result、data-testidを維持する。

## 既存sliceからの移行境界

[REQ-SURVIVAL-TIME-LIMIT](survival-time-limit-v1.md)の180000ms victory、terminal停止、retry、ammo box respawnを維持する。本要件が限定的にsupersedeするのは、生存runの時間進行をRunStateとwave HUDでも観測する点だけである。

[REQ-DIRECTIONAL-SPAWN](directional-spawn-v1.md)の60秒spawn phase、4方向、initial 8体、段階投入、strict spawn、death respawn、hidden recycleも維持する。waveとspawn phaseは同じrun開始時刻を基準にするが、wave境界で行う処理は異なる。spawn phaseは次回spawnの方向入力、waveは利用者向け進行表示であり、相互に敵配置を命令しない。

## terminalとretry

victoryまたはdefeatでは既存の敵spawn、death、recycle、reload、ammo box、生存timerを停止する。terminal後にRunStateのenemy eventや時刻進行でHUD、sprite、killsを変更してはならない。retryは新しいrunとしてelapsed、wave、敵slot、killsを初期化し、既存のmap、初期8体、段階投入、HUD、result導線も初期化する。初期化時のactive、current、remainingはstrict spawn成功済みslotの実数であり、候補不足を12または初期8で埋めない。

## 受け入れ条件

1. 起動直後およびretry後のRunState初期化時は、elapsed 0、wave 1、wave残り01:00、goal 12、kills 0を表示する。active、current、remainingはstrict spawn成功済みslotの実数とし、初期8体のstrict spawnがすべて成功した時点ではcurrentとremainingが8となる。候補不足時はその時点の実数を維持し、既存の1000ms再試行で成功を待つ。
2. 既存の3000/6000/9000/12000msの各stagger spawnが成功するたびに、active、current、remainingはその時点の実数から1だけ増える。初期8体がすべて成功済みの場合に限り、各成功後は8→9→10→11→12へ到達する。候補不足時はgoalまたはkillsを変えずその時点の実数を維持し、同じstrict条件で1000ms後に再試行する。
3. 60000msと120000msの境界でwave表示だけが2、3へ進み、既にactiveな敵の位置、HP、stable ID、spawn metadataを変更しない。
4. hidden recycle中は対象slotだけが一時的にcurrent/remainingから外れ、re-entry成功後に戻る。recycle前後でkillsは不変とする。
5. 敵撃破時は対象slotがcurrent/remainingから外れ、killsが1だけ増える。death respawn成功時はHPを回復してcurrent/remainingへ戻し、killsは維持する。
6. 180000msの境界でwave 3、wave残り00:00、victory terminalとなり、既存の結果表示と停止を維持する。defeatもRunStateをterminalへ遷移する。
7. retry後はelapsed 0、wave 1、wave残り01:00、goal 12、kills 0、既存の03:00とammo/reload/result初期値へ戻る。active、current、remainingは新runで成功済みspawnの実数とし、初期8体がすべて成功した時点では8となる。

## 対象外と繰り延べ判断

wave固有の新敵、enemy type変更、敵数増加、intermission、撃破quota、wave報酬、drop、balance scaling、汎用wave director、設定基盤、multiplayer sync、persistence、新規依存は対象外とする。固定12 slotと既存spawn契約を超えるgameplay判断は、利用者確認または別Issueで受け入れ条件を合意してから扱う。

TypeScriptの設計同期は手動reviewと対象unit/E2Eで行う。現行DOCGENはPython sourceだけを対象とするため、新しいTypeScript DOCGEN transformは追加しない。技術検証のPASSは顧客またはプロジェクトオーナーの承認を意味しない。

## 検証

- rules unitでwave境界、180000ms terminal、spawn/death/recycle、current/remaining/kills、defeat、retryの純粋遷移を確認する。
- Playwright Chromiumで初期状態、4回の段階spawn、wave境界、recycle、death respawn、victory、defeat、retryのHUD/data-testidを確認する。
- 文書変更後はdocs link検査を実行する。
