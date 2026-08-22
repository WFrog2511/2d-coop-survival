---
id: DESIGN-DETAIL-DIRECTIONAL-SPAWN
requirements: REQ-DIRECTIONAL-SPAWN
specification: SPEC-DIRECTIONAL-SPAWN
basic_design: DESIGN-BASIC-DIRECTIONAL-SPAWN
---

# directional-spawn-v1 詳細設計

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | 60秒phaseによる4方向の敵spawn、stable 12 slot、主9・反3 |
| 対応する要件 | [REQ-DIRECTIONAL-SPAWN](../../20_requirements/directional-spawn-v1.md) |
| 対応する仕様 | [SPEC-DIRECTIONAL-SPAWN](../../30_specs/directional-spawn-v1.md) |
| 対応する基本設計 | [DESIGN-BASIC-DIRECTIONAL-SPAWN](../basic/directional-spawn-v1.md) |
| Definition of Delivery | [Issue #22 comment 5222574276](https://github.com/WFrog2511/2d-coop-survival/issues/22#issuecomment-5222574276) |
| ステータス | Implemented |
| 作成者 | Sol |
| 最終更新 | 2026-08-08 |
| 設計同期 | TypeScriptは手動同期。[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)までtransform対象外 |

## 1. 目的

60秒ごとにmap seedから決定的に切り替わる主方向と反対方向を、初回combat epochからの敵初期spawnおよびrespawnへ適用する実装判断を定める。phase境界でactive enemyを再配置せず、既存の戦闘・索敵・有限弾薬・弾薬箱respawnを維持しながら、位置取りの判断を加える。

本書は純粋関数、Phaser Scene、DOM HUD、DEV限定hook、失敗時復元、unit/E2Eが共有する期待値を固定する。

### Issue #38 follow-up

[Issue #38](https://github.com/WFrog2511/2d-coop-survival/issues/38)はIssue #22のphase・stable slot・主9反3を維持し、旧「初期12体即時」「enemy fallback」「HP/delay不変」を上書きする。初期対象は`basic-1..6`と`drone-1..2`、残りは3000/6000/9000/12000ms staggerである。enemy spawnはassigned direction、actual viewport外、hidden、reachable、unoccupiedを必須とし、候補なしは同reasonで1000ms retryする。

基本敵HP4、ドローンHP2・小口径耐性なし、death delayは5000〜9000ms/3000〜6000msとする。death成功だけ全HP、recycleはHPを保持する。hidden 8000〜12000ms、最終hitから3000ms、path 10 edge以上、同時1体を満たすenemyをinactive化し、2000〜4000ms後にstrict re-entryする。

基本敵はID固定でdirect/left/right各3体、stable seedのBFS tie-break、`TILE_SIZE`内の局所分離を使う。ドローンは既存直接経路と横移動を維持する。timerはCanvas上部中央、HP数値/progressは左下、ammoは右下へDOM overlayし、pointerを遮らない。stagger/retry/death/recycle TimerEventはgeneration/terminal guardを持ち、stop/reset/terminalですべてclearする。

### Issue #78の時間契約移行

[DESIGN-DETAIL-WAVE-PROGRESSION](wave-progression-v1.md)は、旧3分期限、630000ms自動勝利、preparation/combat/rest設計、run開始時のenemy epochをsupersedeする。8 phaseのNight 1開始時だけinitial/staggerとdirectional spawn lifecycleを開始し、Boss Nightは明示Boss撃破までplayingを維持する。主方向/反対方向、60秒spawn phase、strict spawn、terminal/retry generation guard、ammo box respawn契約は維持する。

## 2. 対象範囲

### 対象

| 項目 | 内容 |
| --- | --- |
| 対象ユースケース | 初期8体、4段階投入、60秒phase、death respawn、hidden recycle、retry |
| 対象ロール | ローカル1人用プロトタイプのplayer、E2Eを実行する開発者 |
| 対象画面/API | Phaser arena、診断HUD、TypeScript純粋関数、DEV限定`debugRespawnEnemy` |
| 対象データ | map seed、combat epoch、phase、stable slot、spawn方向、enemy metadata |

### 対象外

| 項目 | 理由 |
| --- | --- |
| wave director、敵数の動的増減 | 固定12体のPrototype standardを超えるため |
| phase連動HP・速度・damage・delay | Issue #38の固定balanceだけを採用し、phase連動はしないため |
| 汎用spawn strategy、可変比率設定 | 一つの固定規則に対する将来用抽象化となるため |
| multiplayer sync、server authority、persistence | ローカルrun内だけの状態であるため |
| production向けdebug API | DEV E2E専用hookであり利用者向け契約ではないため |
| 新規依存、外部asset | 既存TypeScript、Phaser、DOMで実現できるため |
| TypeScript DOCGEN transform | [Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)へ延期されているため |

## 3. 関連ドキュメント

| 種別 | リンク |
| --- | --- |
| 要件定義 | [REQ-DIRECTIONAL-SPAWN](../../20_requirements/directional-spawn-v1.md) |
| 仕様 | [SPEC-DIRECTIONAL-SPAWN](../../30_specs/directional-spawn-v1.md) |
| 基本設計 | [DESIGN-BASIC-DIRECTIONAL-SPAWN](../basic/directional-spawn-v1.md) |
| Definition of Delivery | [Issue #22 comment 5222574276](https://github.com/WFrog2511/2d-coop-survival/issues/22#issuecomment-5222574276) |
| TypeScript DOCGEN follow-up | [Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31) |

## 4. 業務ルール

| ルールID | ルール | 根拠 | 未決事項 |
| --- | --- | --- | --- |
| BR-DSP-001 | phaseは`floor(max(0, now - combatStartedAt) / 60000)`とし、初回combat epochではphase 0とする。preparationのHUDもphase 0を表示するがspawn epochではない | Issue #22 DOD / Issue #71 | なし |
| BR-DSP-002 | 主方向は`up`、`right`、`down`、`left`をmap seedとphaseで決定的に循環させる | Issue #22 DOD | なし |
| BR-DSP-003 | spawn方向はspawn時点のplayer tileを基準に判定する | Issue #22 DOD | なし |
| BR-DSP-004 | stable slotは`index % 4 === 3`だけ反対方向、それ以外は主方向とし、12 slotで主9・反3とする | Issue #22 DOD | なし |
| BR-DSP-005 | stable IDは`basic-1`〜`basic-9`、`drone-1`〜`drone-3`の12個とする | Issue #22 DOD | なし |
| BR-DSP-006 | phase境界ではactive enemyを再配置せず、次のspawnまたはrespawnだけにcurrent phaseを適用する | Issue #22 DOD | なし |
| BR-DSP-007 | retryは旧generationを無効化し、新runを新map seed、enemy-free preparation、phase 0表示で開始する。初期8体と4段階投入予約は次の初回combat epochで一度だけ開始する | Issue #22 / #38 / #71 | なし |

## 5. 利用者導線・処理フロー

```mermaid
flowchart TD
  start["run開始またはretry"] --> reset["generation更新・survivalStartedAt設定"]
  reset --> map["map・player・弾薬箱を構築"]
  map --> slots["12 stable slotを列挙"]
  slots --> preparation["enemy-free preparation"]
  preparation --> spawn["初回combat epochでspawnEnemyをphase 0で実行"]
  spawn --> playing["playing"]
  playing --> update["updateSpawnPhaseHud"]
  update --> phase{"60秒境界を越えたか"}
  phase -->|yes| hud["phase・主方向HUDだけ更新"]
  phase -->|no| playing
  hud --> keep["active enemyは位置・metadataを維持"]
  keep --> playing
  playing --> defeatEnemy{"敵を撃破したか"}
  defeatEnemy -->|yes| respawnTimer["既存respawn TimerEventを登録"]
  respawnTimer --> guard{"generation一致かつ非terminalか"}
  guard -->|yes| current["spawnEnemyへcurrent phaseを渡す"]
  guard -->|no| discard["副作用なしで終了"]
  current --> playing
  playing --> terminal{"victoryまたはdefeatか"}
  terminal -->|yes| stop["run timer停止・physics pause"]
  stop --> retry["retry操作"]
  retry --> start
```

| ステップ | 操作者 | 入力 | システム処理 | 出力 |
| ---: | --- | --- | --- | --- |
| 1 | system | map seed、`survivalStartedAt` | enemy-free preparationを開始し、phase 0を表示 | 初期HUD、active enemy 0 |
| 1a | system | 初回combat epoch | phase 0の初期8体をspawnし、4体をstagger予約 | 初期population、phase HUD |
| 2 | player | 移動・戦闘 | active enemyを既存AIで更新 | 既存戦闘表示 |
| 3 | system | `now` | 60秒境界でphaseと主方向HUDだけ更新 | 次回spawn用phase |
| 4 | system | 敵撃破、respawn timer | generationとterminalを検査し`spawnEnemy`を再利用 | current phaseのrespawn |
| 5 | player | retry | 全enemy timerと旧generationを破棄 | phase 0表示、新map、enemy-free preparation |

## 6. 状態遷移

```mermaid
stateDiagram-v2
  [*] --> phase0: reset
  phase0 --> phaseN: 60000ms境界
  phaseN --> phaseN: 次の60000ms境界
  phase0 --> terminal: victory / defeat
  phaseN --> terminal: victory / defeat
  terminal --> phase0: retry
```

| 状態 | 意味 | 遷移条件 |
| --- | --- | --- |
| phase 0 | 初回combat epochから59999msまでの初期spawn phase。preparation中のHUDも0を表示する | initial lifecycle開始 |
| phase N | 0始まりのcurrent phase。HUDと新規spawn入力だけが変わる | `now >= combatStartedAt + N * 60000` |
| terminal | victoryまたはdefeat。spawn/respawn停止 | dynamic run終端またはplayer HP 0 |

phase遷移はactive enemyの再配置イベントではない。既にactiveなenemyはspawn時のphase、主方向、割り当て方向、tileを保持する。

## 7. データ設計

### 7.1 手書き設計方針

| データ | 型・値 | 設計方針 |
| --- | --- | --- |
| `SpawnDirection` | `'up' \| 'right' \| 'down' \| 'left'` | 順序を固定し、主方向の循環と反対方向計算へ共用する |
| `phase` | 0以上の整数 | `combatStartedAt`と`now`から都度算出し、永続化しない。preparation中は0を表示する |
| `stableSlot` | 0〜11の整数 | stable enemy ID配列のindexとし、run中に並び替えない |
| `ENEMY_INSTANCE_IDS` | basic 9 ID、drone 3 ID | CombatState、sprite、HUD、slot割り当ての共通identityとする |
| `SpawnRequest.direction` | optional `SpawnDirection` | 未指定時は既存offscreen selectorとして動作する |
| enemy sprite metadata | stable ID、spawn phase、primary/assigned direction、spawn tile | 成功したspawn時点の値を保持し、phase境界では更新しない |

### 7.2 enemy metadata dataset

| DOM属性 | 値 | 更新契機 |
| --- | --- | --- |
| `data-stable-id` | enemy stable ID | spawn成功後のHUD同期 |
| `data-spawn-phase` | spawn時の0始まりphase | spawn成功後のHUD同期 |
| `data-primary-direction` | spawn時の主方向 | spawn成功後のHUD同期 |
| `data-assigned-direction` | stable slotへ割り当てた主方向または反対方向 | spawn成功後のHUD同期 |
| `data-spawn-tile` | `x,y` | spawn成功後のHUD同期 |
| `data-active` / `data-spawn-reason` / `data-recycle-count` | lifecycle観測値 | active変更とHUD同期 |

`data-testid="spawn-phase"`は表示値`phase + 1`と`data-phase`を持つ。`data-testid="primary-direction"`は日本語表示と`data-direction`を持つ。既存HP値とvisibility datasetは同じenemy outputで維持する。

### 7.3 TypeScript手動同期

本機能のsourceはTypeScriptであるため、自動生成予約および自動生成blockを置かない。type、定数、関数signature、Scene private method、datasetは実装diffと本書を手動reviewして同期する。TypeScript public情報transformは[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)まで対象外とし、このsliceでは追加しない。

## 8. サービス・API設計

| サービス/API | 種別 | 入力 | 出力 | 責務・主なエラー |
| --- | --- | --- | --- | --- |
| `spawnPhaseAt(combatStartedAt, now)` | pure function | Scene時刻2値 | 0以上のphase | 負の経過時間を0へclampし、60000msで除算してfloorする |
| `primarySpawnDirection(seed, phase)` | pure function | map seed、phase | `SpawnDirection` | unsigned seedと0以上の整数phaseから4方向を決定的に循環させる |
| `spawnDirectionForSlot(primary, stableSlot)` | pure function | 主方向、slot index | `SpawnDirection` | `index % 4 === 3`だけ反対方向を返す |
| `selectEnemySpawnTile(map, request, seed)` | pure selector | map、player、viewport、occupied、required direction、seed | `TilePosition \| null` | strict hidden/offscreen/direction候補だけを返す |
| `Arena.spawnEnemy(id, reason)` | Scene private method | stable ID、reason | `boolean` | strict selector成功時だけspriteとmetadataを更新する |
| `Arena.scheduleEnemySpawn(id, reason, delay)` | Scene private method | stable ID、reason、delay | `void` | generation/terminal guardと1000ms retryを管理する |
| `debugRespawnEnemy(id)` | DEV限定Scene public method | stable enemy ID | `void` | E2E用に既存`spawnEnemy`を再利用する。拒否条件または復元後の失敗は例外 |

外部HTTP API、永続化API、利用者向けJavaScript APIは追加しない。

## 9. candidate選択

弾薬箱用`selectSpawnTile`のfallbackは変更しない。enemy用`selectEnemySpawnTile`はreachable、unoccupied、viewport外、hidden、assigned direction一致をすべてAND条件にし、0件なら`null`を返す。

1. map内floorから、playerへ到達可能かつ`occupied`に含まれないcandidateを作る。
2. candidateから現在のcamera viewport外にある`outside`を作る。
3. requested directionがある場合、`outside`からplayer基準方向が一致する`directed`を作る。
4. direction不一致やvisible候補へfallbackしない。
5. strict candidateの既存順序を保ち、`(seed >>> 0) % pool.length`のindexを選ぶ。
6. candidate 0件は`null`とし、Sceneがinactive/hiddenのまま1000ms後に同reasonで再試行する。

player基準方向は`dx = target.x - player.x`、`dy = target.y - player.y`で求める。`abs(dx) > abs(dy)`なら`dx`の符号で左右、それ以外は`dy`の符号で上下を選ぶ。同率は上下を優先する。

enemy spawnの`occupied`にはspawn時点のplayer、activeな弾薬箱、activeなworld item（weapon/material/ammo）、対象以外のactive enemyを含める。初期spawnも先にspawnしたenemyを除外するため、12体を同じtileへ配置しない。

## 10. reset、update、spawn、respawn、terminal

### reset

1. generationを増やす。
2. survival、stagger/retry/death/recycle、flash、ammo box、reloadのTimerEventを停止・clearする。
3. CombatState、時刻、death/recycle count、lastHit、hiddenSince、lock、path、visibility cacheを初期化する。
4. 新map、player、visibility mask、camera、弾薬箱を構築する。
5. enemy-free preparationを開始し、初回combat epochで初期8 IDをstrict spawnする。失敗は1000ms retry、残り4 IDはcombat epochから指定時刻へstagger予約する。
6. survival timer、DEV公開、HUDを初期化する。

### update

毎frameの既存updateで`updateSpawnPhaseHud`を呼び、current phaseと主方向を表示する。HUD更新からenemyの再配置、metadata更新、respawn登録を行わない。

### spawn

`spawnEnemy`はplayer tile、current phase、map seed、stable slot、割り当て方向、occupiedを求めて`selectEnemySpawnTile`を呼ぶ。成功時はspriteを有効化し、stable ID、phase、方向、tile、reasonを同期する。

### respawn

敵撃破時はspriteを無効化し、種別ごとの決定的death delay後にstrict spawnする。成功時だけ`respawnEnemy`で全HPへ戻す。recycleはCombatStateを変更せず、HPを保持する。

### terminal

victoryまたはdefeatでrun timerを停止し、player/enemy velocityを0、弾を無効化、physicsをpauseする。terminal後のrespawn callbackは実行しない。retryはresetへ戻りenemy-free preparationとphase 0表示から新runを開始する。

## 11. バリデーション・エラーと復元

| 条件 | 表示・返却 | 回復導線 |
| --- | --- | --- |
| `selectEnemySpawnTile`のcandidateが0件 | `null` | 同reasonの1000ms retry |
| initial/stagger失敗 | 1000ms retry | inactive/hiddenと同reasonを維持 |
| death/recycle失敗 | 1000ms retry | death HP0またはrecycle現在HPとlockを維持 |
| 旧generation callback | 副作用なし | current runを継続 |
| terminal中callback | 副作用なし | retryまでterminalを維持 |
| DEVで未知のID | 例外 | テストデータを修正 |
| DEVでinactiveまたはterminal | 例外 | 有効なplaying状態で再実行 |
| DEV再出現のcandidateなし | respawn count、元位置、spawn metadata、body、visibilityを復元後に例外 | 復元したplaying状態を維持 |

失敗時にplayer、弾薬箱、activeなworld item（weapon/material/ammo）、他enemyと重複する位置へ強制spawnしない。通常respawn失敗時はCombatStateだけを復活させず、spriteとstateの不一致を避ける。

## 12. DEV/production境界と非機能要件

### DEV/production境界

`debugRespawnEnemy`はDEV環境だけで呼出し可能とし、`window.__arenaScene`もDEV環境だけで公開する。production buildではScene、enemy操作、debug hookをglobalへ公開しない。hookはE2Eでcurrent phaseの通常`spawnEnemy`統合を観測するためだけに使う。

### 権限・監査

| 操作 | 許可境界 | 拒否条件 | 監査ログ |
| --- | --- | --- | --- |
| 通常spawn/respawn | Phaser Scene内部 | terminal、旧generation、候補なし | 永続監査ログなし。HUDで現在状態を観測 |
| `debugRespawnEnemy` | DEV環境のE2E | production、未知ID、inactive、terminal | 永続監査ログなし。例外とdatasetで検証 |

秘密情報、認証情報、個人情報は扱わない。

### 非機能要件

| 観点 | 方針 |
| --- | --- |
| 性能 | phase計算とHUD更新は定数時間。候補探索はspawn/respawn時だけ行い、phase境界で12体を再探索・再配置しない |
| 可用性 | 旧generationとterminal guardで遅延callbackの副作用を防ぎ、candidate不足時は重複生成より非生成を優先する |
| セキュリティ | productionでDEV hookとSceneをglobal公開しない。外部入力、通信、永続化を追加しない |
| アクセシビリティ | phaseと主方向を色だけでなく日本語テキストとDOM outputで表示し、敵HPとspawn metadataを既存の構造化HUDへ保持する |
| 運用 | map seed、phase、方向、stable ID、spawn tileをdata属性から再現・診断可能にする |

## 13. テスト観点

| レベル | 観点 | 期待結果 |
| --- | --- | --- |
| unit | phase直前・境界・複数phase | 59999msはphase 0、60000msはphase 1、同じ入力は同じ結果 |
| unit | 主方向循環 | 同じseedとphaseは同じ方向、連続4 phaseで4方向を一巡 |
| unit | stable slot | 12 slotで主方向9、反対方向3、`index % 4 === 3`だけ反対 |
| unit | 方向判定 | 左右優先条件と同率時の上下優先が仕様どおり |
| unit | strict enemy selector | up/right/down/leftでreachable、unoccupied、offscreen、hidden、direction一致を検証し、visible/wrong-direction/occupiedは`null` |
| unit/E2E | population | 初期8体と段階投入後12体がplayer、弾薬箱、activeなworld item（weapon/material/ammo）、他enemyと非重複 |
| integration/E2E | population/phase | 初期8体、4段階投入後12体、phase境界でactive metadata不変 |
| integration/E2E | DEV respawn | 1体だけが既存`spawnEnemy`経由でcurrent phase、方向、新tileを取得し、他11体は不変 |
| E2E | retry/HUD | phase 0、初期8体、stagger予約、時間上中央・HP左下・ammo右下 |
| 既存回帰 | Issue #20 | visibility、boundary silhouette、hidden、暗転maskを維持 |
| 既存回帰 | Issue #21 | 有限弾薬、射撃、武器切替、リロード、ammo panelを維持 |
| 既存回帰 | Issue #34 | #71前の3分勝利は履歴とし、terminal停止、弾薬箱respawn、retryを維持 |

## 14. Gherkin受け入れ条件候補

```gherkin
Feature: 方向別enemy spawn

  Scenario: 60秒境界ではactive enemyを再配置しない
    Given phase 0で段階投入完了後の12体がactiveである
    And 各enemyのstable ID、spawn phase、方向、spawn tileを記録している
    When 初回combat epochから60000msの境界へ進む
    Then HUDのcurrent phaseはphase 1になる
    And 主方向はmap seedとphase 1に対応する方向になる
    And activeな12体の位置とspawn metadataは変わらない

  Scenario: phase境界後のrespawnだけがcurrent phaseを使う
    Given phase 1で12体のenemyがactiveである
    When DEV環境で1体をdebugRespawnEnemyにより再出現させる
    Then その1体はphase 1の主方向とstable slotの割り当て方向を持つ
    And その1体はplayer、弾薬箱、activeなworld item（weapon/material/ammo）、他enemyと重複しない到達可能tileにいる
    And 他の11体のspawn metadataは変わらない

  Scenario: retryはenemy-free preparationとphase 0表示から新runを開始する
    Given phase 1以降またはterminal状態である
    When playerがretryする
    Then run generationが更新される
    And current phaseはphase 0になる
    And 新しいmap seedに対応する主方向、enemy-free preparationが初期化される
    And 次の初回combat epochで初期8体、4体のstagger予約が一度だけ開始される
    And 旧generationのcallbackは新runへ副作用を与えない
```

## 15. 自動生成境界

本書には自動生成予定範囲および自動生成範囲を設けない。対象実装がTypeScriptであり、現行transformはPython sourceだけを対象とするためである。TypeScriptは実装diffと本書を手動同期し、`docgen.py --check`のPASSをTypeScript同期のPASSへ読み替えない。TypeScript transformは[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)まで対象外とする。

## 16. 未決事項・人間確認

| ID | 確認事項 | 判断者 | 期限 | 影響 |
| --- | --- | --- | --- | --- |
| Q-DSP-001 | 主9・反3の方向圧力がスリルと位置取りの判断を生むか | 顧客またはプロジェクトオーナー。別`type:customer-review` Issueで確認 | 実装後レビュー時 | 技術PASSとは分離し、必要なら将来のbalance sliceを判断 |

## 17. 変更履歴

| 日付 | 変更内容 | 理由 | 変更者 |
| --- | --- | --- | --- |
| 2026-08-08 | 初版作成。実装済みdirectional spawn、DEV境界、検証観点を記録 | Issue #22 DODとTypeScript実装を手動同期 | Sol |
