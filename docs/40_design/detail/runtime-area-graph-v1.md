---
id: DESIGN-DETAIL-RUNTIME-AREA-GRAPH-V1
requirements: REQ-RUNTIME-AREA-GRAPH-V1
specification: SPEC-RUNTIME-AREA-GRAPH-V1
---

# runtime-area-graph-v1 詳細設計

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | current topologyからのarea / junction / corridor graph導出 |
| 対応する基本設計 | [DESIGN-BASIC-RUNTIME-AREA-GRAPH-V1](../basic/runtime-area-graph-v1.md) |
| 対応する要件 | [REQ-RUNTIME-AREA-GRAPH-V1](../../20_requirements/runtime-area-graph-v1.md) |
| 対応する仕様 | [SPEC-RUNTIME-AREA-GRAPH-V1](../../30_specs/runtime-area-graph-v1.md) |
| 関連Issue | [Issue #100](https://github.com/WFrog2511/2d-coop-survival/issues/100) |
| ステータス | Prototype standardの最小runtime graph slice |
| 同期方法 | TypeScriptのため手動review。DOCGEN予約・生成ブロックを置かず、[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)のTypeScript transform対象外とする |

## 1. データと分類

| データ | 所有者 | 契約 |
| --- | --- | --- |
| `RuntimeTopology` | `src/runtime-topology.ts` | current tilesとrevisionを持つ唯一のterrain入力。graphは変更しない |
| `RuntimeAreaGraph` | `src/runtime-area-graph.ts` | 同revisionの派生node、edge、tile query snapshot |
| `RuntimeAreaNode` | `src/runtime-area-graph.ts` | 同kindの4近傍component。ID、kind、row-major tile群、node順で重複しない`neighborIds`を持つ |
| `Arena.areaGraph` | `src/main.ts` | current topologyと同じrunのgraph。resetと成功mutationだけで交換する |

1. floor tileごとに、tileを含む2×2全floor blockがあるか確認する。あれば`area`。
2. area以外のfloorは4近傍floorを数え、3以上なら`junction`、それ以外は`corridor`。
3. row-major順の未訪問tileから同kindだけを4近傍探索し、componentを一nodeにする。
4. nodeが異なる隣接floorの接触を重複なくedgeにする。

node IDはkindごとのcomponent探索順、node tileはrow-major順、edgeはnode index順で固定する。edge確定後に各nodeへ接続先IDを`neighborIds`として一度だけ埋める。mutationにより分類やIDが変わっても、前revisionとの対応付けは行わない。

## 2. lifecycle

~~~mermaid
stateDiagram-v2
  [*] --> Reset
  Reset --> Fresh: topology revision 0 -> graph revision 0
  Fresh --> Fresh: rejected/no-op mutation
  Fresh --> Rebuilt: successful mutation -> topology revision + 1 -> new graph
  Rebuilt --> Reset: retry/new run
~~~

`applyTopologyMutations()`は既存のatomic validation結果が同一snapshotなら直ちに戻り、graphもterrainも更新しない。新snapshotなら最初に`areaGraph`を再導出し、その後に既存のterrain rebuild、path/visibility cache reset、minimap、HUD更新を実行する。graph作成はPhaser objectに触れないため、失敗しない正常入力では既存runtime責務を広げない。

## 3. DEVと失敗時動作

| 条件 | 動作 | 影響 |
| --- | --- | --- |
| wallまたは範囲外tileのquery | `runtimeAreaNodeAt`は`undefined` | graphを変更しない |
| 未知node IDのquery | `runtimeAreaNeighbors`は空配列 | graphを変更しない |
| rejected/no-op mutation | topologyと同じgraph snapshotを保持 | Phaser rebuildなし |
| successful mutation | 同revisionの新graphを作る | 既存terrain rebuildだけを続行 |
| retry/new run | 新topologyからrevision 0 graphを作る | 前run graphを保持しない |

production向けのglobal API、UI、通信、保存は追加しない。DEV E2Eだけが既存`window.__arenaScene`から`areaGraph`を読む。

## 4. テスト観点

| レベル | 観点 | 期待結果 |
| --- | --- | --- |
| unit | 2×2 area、細いcross junction、同kind component | tileが一意の期待kind nodeへ割り当てられる |
| unit | node接続、unknown query、決定性、入力不変 | edge重複がなく、同一入力は同一graph、topologyを変更しない |
| E2E | DEV wall→floorとretry | graph snapshot交換、topologyとのrevision一致、retry後revision 0 |

TypeScript sourceは現行DOCGEN transformの対象外である。`src/runtime-area-graph.ts`、`src/main.ts`、対象unit、既存#98 E2Eを手動reviewして同期する。

## 5. 変更履歴

| 日付 | 変更内容 | 理由 |
| --- | --- | --- |
| 2026-08-19 | 初版作成 | Issue #100でAI前提となる最小runtime graph境界を追加 |
