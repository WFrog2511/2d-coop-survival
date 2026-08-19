---
id: DESIGN-BASIC-RUNTIME-TOPOLOGY-V1
requirements: REQ-RUNTIME-TOPOLOGY-V1
specification: SPEC-RUNTIME-TOPOLOGY-V1
implementation_issue: https://github.com/WFrog2511/2d-coop-survival/issues/98
---

# runtime-topology-v1 基本設計

## 責務分割

| 境界 | 責務 |
| --- | --- |
| `src/arena-map.ts` | stable `ArenaMap`の決定的生成と、metadataを要求しない`ArenaTerrain`のBFS / LOS / spawn / drop API |
| `src/runtime-topology.ts` | tile deep clone、atomic batch validation、revision、必須中央予約・外周guard |
| `src/main.ts` | stable mapとcurrent topologyの所有、terrain-only rebuild、cache refresh、DEV wall→floor入口 |
| `src/arena/hud.ts` | current topologyと観測snapshotから既存Canvasミニマップを描画 |
| `tests/runtime-topology.test.ts` | snapshotとatomicityの純粋unit |
| `e2e/prototype.spec.ts` | PhaserのGraphics / collider / input / retryを含む代表利用経路 |

## データと流れ

~~~mermaid
flowchart LR
  generate[generate ArenaMap] --> stable[stable map: seed/start/reserve/metadata]
  stable --> clone[create RuntimeTopology revision 0]
  clone --> terrain[current tiles]
  terrain --> runtime[Phaser graphics/colliders/path/LOS]
  stable --> guard[required central reserve guard]
  mutation[DEV wall to floor] --> validate[full batch validation]
  guard --> validate
  validate --> terrain
  runtime --> minimap[observed terrain and minimap]
  retry[retry/new run] --> stable
~~~

`ArenaMap`と`RuntimeTopology`を混ぜず、stable mapは「どのrunを生成したか」、topologyは「現在どのtileが通行可能か」を表す。runtimeでseedを必要とする選択だけはstable mapからseedを受け、terrainを必要とする選択はtopologyを受ける。

## 再構築境界

run resetはterrainとitemを一度初期化する。一方、mutation後は`rebuildTerrain()`だけを呼び、wall Graphics、static wall collider、world boundsをcurrent topologyから全体再構築する。ammo box / world item group、state map、enemy actor、inventory、timerをmutationに伴ってclearしない。

変更後はpathとenemy visibility cacheを捨て、同じ既存LOS passでvisibility mask、`observedTiles`、`visibleTileKeys`、minimapを更新する。combat中のenemy actor / sprite / bodyやcombat stateはterrain rebuildの対象に含めない。event bus、差分renderer、revision別cacheは導入しない。

## Ponytailの境界

既存のTile、BFS、LOS、Phaser `StaticGroup`、Graphics、Canvas HUD、DEV scene公開面を再利用する。新規依存、Room / Area graph、Acoustic Graph、動的blocker抽象化、汎用mutation frameworkは追加しない。

`ponytail: terrain rebuildはwall群の全体再構築に限定する。floor→wall、wall damage、差分更新、または一runで多数の変更が必要になった時に、occupant退避方針と差分更新の必要性を再評価する。`
