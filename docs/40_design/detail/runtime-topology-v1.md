---
id: DESIGN-DETAIL-RUNTIME-TOPOLOGY-V1
requirements: REQ-RUNTIME-TOPOLOGY-V1
specification: SPEC-RUNTIME-TOPOLOGY-V1
---

# runtime-topology-v1 詳細設計

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | stable mapから分離したcurrent terrain、atomic mutation、terrain-only Phaser rebuild |
| 対応する基本設計 | [DESIGN-BASIC-RUNTIME-TOPOLOGY-V1](../basic/runtime-topology-v1.md) |
| 対応する要件 | [REQ-RUNTIME-TOPOLOGY-V1](../../20_requirements/runtime-topology-v1.md) |
| 対応する仕様 | [SPEC-RUNTIME-TOPOLOGY-V1](../../30_specs/runtime-topology-v1.md) |
| 関連Issue | [Issue #98](https://github.com/WFrog2511/2d-coop-survival/issues/98) |
| ステータス | Prototype standard の最小runtime topology slice |
| 同期方法 | TypeScriptのため手動review。DOCGEN予約・生成ブロックを置かず、[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)のTypeScript transform対象外とする |

## 1. データ設計

| データ | 所有者 | 契約 |
| --- | --- | --- |
| `ArenaMap` | `src/arena-map.ts` | seed、start、rooms、corridors、obstacles、中央予約metadata、生成時のtile layout。runtime mutationは変更しない |
| `ArenaTerrain` | `src/arena-map.ts` | `width`、`height`、`tileSize`、`tiles`だけを表す構造型。BFS / LOS / floor判定が受け取る |
| `RuntimeTopology` | `src/runtime-topology.ts` | deep-cloneしたcurrent tilesとrevision。stable metadataを持たないreadonly snapshot |
| `RuntimeTopologyMutation` | `src/runtime-topology.ts` | `{ x, y, tile }`。batch callはstable `CentralReserve`を必須guardとして受け、最後の同一座標値が最終値になる |
| `observedTiles` / `visibleTileKeys` | `src/main.ts` | current topologyのLOSから更新するミニマップ用観測state |

TypeScript sourceは現行DOCGEN transformの対象外である。`src/arena-map.ts`、`src/runtime-topology.ts`、`src/main.ts`、`src/arena/hud.ts`、対象unit、代表E2Eを手動reviewして同期する。

## 2. batch状態遷移

~~~mermaid
stateDiagram-v2
  [*] --> Current
  Current --> Validating: mutations
  Validating --> Rejected: missing reserve or invalid coordinate/tile/reserve/exterior
  Rejected --> Current: no write
  Validating --> Unchanged: all final values are no-op
  Unchanged --> Current: same snapshot/revision
  Validating --> Applied: one or more final values differ
  Applied --> Current: cloned tiles/revision + 1
~~~

batch callは中央予約metadataが必須であり、欠ける場合はvalidationより先にfail fastする。validationはmutationごとに整数、tile種別、bounds、外周、中央予約boundsを確認する。すべて通ってから最後のtile値を集約し、変更がある場合だけ新しいrow配列とtopologyを作る。失敗時のrollbackは、apply前の配列へ一切書き込まないことで保証する。

## 3. runtimeフロー

1. `reset()` はstable mapを生成または次mapへ進め、`createRuntimeTopology()`でrevision `0`を作る。
2. run初期化ではitem stateをclearしてからterrainを構築し、既存のammo box、world item、enemy lifecycleを開始する。
3. `debugOpenWall()` はDEV guardとcurrent wall確認後、wall→floorの一件batchを渡す。
4. 成功時だけ`Arena`はtopologyを交換し、terrain Graphicsとwall static groupを全体再構築する。
5. path、enemy visibility、visibility-mask cacheをclear / invalidateし、force LOS、観測state、minimap、pickup prompt、HUDを更新する。
6. retry / new runは旧topologyを再利用せず、次のstable mapからrevision `0`を作る。

## 4. 失敗時動作と境界

| 条件 | 動作 | stateへの影響 |
| --- | --- | --- |
| 非整数・範囲外・不正tile | batchをthrowしてrejection | topology / revision / Phaser stateを変更しない |
| 外周・中央予約内部 | batchをthrowしてrejection | 生成時の境界・reservationを保持する |
| 中央予約metadata欠落 | batchをfail fastでthrow | topology / revision / Phaser stateを変更しない |
| 全件no-op | 同じsnapshotを返す | rebuildもcache refreshも行わない |
| DEV以外のwall開放 | guardでthrow | 本番にmutation経路を持たない |
| floor→wallを必要とする | 本sliceでは接続しない | occupant、pickup、enemyの退避方針を人間確認するまで停止する |

## 5. テスト観点

| レベル | 観点 | 期待結果 |
| --- | --- | --- |
| unit | deep clone、stable map不変、revision、no-op、重複batch | last-write-winsでtopologyだけが必要時に一度更新される |
| unit | invalid / bounds / exterior / central / metadata欠落 / mixed batch | partial applyがなくrevision不変 |
| unit | current topologyのBFS | 開いたtileをpathが通る |
| E2E | combat中のactive enemy、DEV wall→floor、Graphics、static collider、player input | actor / sprite / body / HPを保持し、通常wallだけが通行可能になりplayerが通過する |
| E2E | observed terrain / DOM minimap Canvas pixel / Graphics command buffer、pickup / inventory保持、retry | current terrainだけが描画更新され、次runはrevision 0 |
