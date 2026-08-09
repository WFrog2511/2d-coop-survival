---
id: DESIGN-BASIC-SURVIVAL-TIME-LIMIT
requirements: REQ-SURVIVAL-TIME-LIMIT
specification: SPEC-SURVIVAL-TIME-LIMIT
---

# survival-time-limit-v1 基本設計

## 方針

既存のCombatState、Phaser SceneのTimerEvent、generation、respawns、flashes、reloadTimer、ammoBoxes、DOM HUDを再利用する。新しいゲーム基盤や依存は導入しない。TypeScript設計は手動同期とし、新しいDOCGEN transformは追加しない。

[DESIGN-BASIC-WAVE-PROGRESSION](wave-progression-v1.md)は、ここで扱う180000ms生存timerと各60000ms waveを、3 combat wave各150000ms、wave 1/2後のrest各60000ms、dynamicな570000ms既定scheduleへsupersedeする。この文書の旧時間値は履歴であり、現在の時間・phase・HUD設計はDESIGN-BASIC-WAVE-PROGRESSIONを正本とする。terminal停止、retry、ammo box respawn、phase境界でenemy配置を変更しない経路は維持する。

| 責務 | 実装経路 |
| --- | --- |
| 期限定数と純粋状態 | src/rules.ts のSURVIVAL_LIMIT_MS、AMMO_BOX_RESPAWN_MS、remainingSurvivalMs、victory遷移、terminal guard、retryCombat |
| 生存timer | src/main.ts のsurvivalTimer、survivalStartedAt、generation、HUD更新 |
| 箱復活 | src/main.ts のstable boxId、currentTile、ammoBoxRespawns、selectSpawnTile、static group |
| terminal停止 | src/main.ts の共通terminal処理。reload、敵/弾、物理、敵respawn、箱復活を停止 |
| 表示 | index.html/style.css の残り時間、result panel、Victory UI、aria-live |
| 期待値 | tests/rules.test.ts と e2e/prototype.spec.ts |

## 利用者導線

1. run開始時にtimerを作成し、HUDへ03:00を表示する。
2. プレイヤーは既存の移動、射撃、リロード、箱取得を行う。
3. 箱取得成功時はstable boxIdと元tileを保持した箱を削除し、boxIdの30000ms timerを1つ作成する。
4. 180000ms境界ではvictoryへ遷移し、残り時間00:00とVictory UIを表示する。
5. victoryまたはdefeatのretryで旧timer/map/state/HUDを破棄し、次のrunを開始する。

## #21/#35既存契約との境界

#21/#35のammo-supply-v1にある「同一run中は取得箱を再出現させない」は履歴契約として維持する。#34 follow-upが限定的にsupersedeするのはfield ammo box（map上のammo box）の再出現処理だけであり、既存の有限ammo契約、ammo/map配置文書、その他の#21/#35実装は変更しない。

survival timerは180000ms、ammo box復活timerは取得から30000msである。victory/defeat/retryで復活timerを停止・clearするterminal優先を守り、terminal後にpending callbackから箱を再出現させない。

## 状態遷移

~~~mermaid
stateDiagram-v2
  [*] --> playing
  playing --> victory: 180000ms到達
  playing --> defeat: HPが0
  playing --> playing: 箱取得 / 箱復活
  victory --> playing: retry
  defeat --> playing: retry
~~~

victoryとdefeatはterminalであり、入力イベントが届いてもルール関数は状態を変更しない。terminalに入った時点で物理演算と全てのrun timerを停止する。

## 失敗時動作

- 旧generationのsurvival、敵respawn、flash、reload、ammo box callbackは状態、sprite、HUDを変更しない。
- 復活待ち中の箱に再度overlapが届いても、active spriteが存在しないため取得処理とtimer登録を行わない。
- 既に同じboxIdのtimerがある場合は追加登録せず、callback時にも同じboxIdまたは同じtileのactive箱を重複生成しない。
- 復活callbackは現在のplayer、camera viewport、active box、enemyをoccupiedとしてselectSpawnTileへ渡し、viewport外の到達可能floorをseed決定的に選ぶ。viewport外候補がない場合は最遠floorへfallbackし、元tileはoccupiedとして除外する。
- terminal中の箱復活callbackは副作用なしで終了する。
- retryは新generationを先に発行してから全timerを停止するため、旧mapのcallbackを新mapへ適用しない。
- 既存の弾切れ、予備弾薬0、リロード中断、敗北の表示と導線は維持する。
- terminalへ入る時点で箱復活Mapをclearするため、同時刻競合によるterminal後の正の復活は許可しない。

## 実装境界と対象外

stable boxIdとcurrentTileを持つ小さなMapだけを使い、汎用inventory・loot・persistence・通信・enemy time scaling・recovery item・wave固有の新敵・intermission・quota・報酬・dropを追加しない。#21/#35の実装、既存ammo/map配置文書、map生成規則は変更しない。候補がまったくない場合は箱を再生成せず、HUDへ失敗を表示する。期限の変更、terminal後の復活、multiplayer sync、永続化が必要になった場合は、Issue #34の条件を更新してから別sliceで再検討する。
