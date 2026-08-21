---
id: SPEC-RUNTIME-AREA-GRAPH-V1
requirements: REQ-RUNTIME-AREA-GRAPH-V1
---

# runtime-area-graph-v1 仕様

## 公開構造

`src/runtime-area-graph.ts`は次のreadonly snapshotを公開する。

| export | 契約 |
| --- | --- |
| `RuntimeAreaNodeKind` | `area` / `junction` / `corridor` |
| `RuntimeAreaNode` | 決定的ID、分類、row-major順のtile群、node順で重複しない`neighborIds` |
| `RuntimeAreaGraphEdge` | node順で正規化した`from` / `to`の無向接続 |
| `RuntimeAreaGraph` | topologyと同じ`revision`、node群、edge群、tileごとのnode ID |
| `createRuntimeAreaGraph(topology)` | 入力を変更せずsnapshotを一回導出する |
| `runtimeAreaNodeAt(graph, tile)` | floorならnode、wall・範囲外なら`undefined` |
| `runtimeAreaNeighbors(graph, nodeId)` | node順の隣接node。未知IDは空配列 |

分類は元topologyだけを参照し、一つのtileの分類中に他tileの分類結果を利用しない。`area`はtile自身を含む全floorの3×3候補のいずれかが成立するときだけ成立する。`area`でないfloorが全floorの2×2候補へ参加するときは`corridor`とする。残る細いfloorだけがjunction判定へ進み、4近傍のfloor数が3以上なら`junction`、そうでなければ`corridor`とする。この`area`は生成時`ArenaMap.rooms`と同名のmetadataではなく、current topologyから導くruntime分類である。

## 決定性

row-majorで最初に到達したtileからcomponentを探索する。各kindのIDはその探索順で`area-1`、`junction-1`、`corridor-1`のように採番する。node tileはrow-major順に正規化し、edgeはnode indexの小さい側を`from`にして重複を除き、`from` / `to` index順に並べる。各nodeの`neighborIds`はこのedge順から作るため、node順で重複しない。同じtopologyなら同じgraph値を返す。terrain mutation後のID対応を保証しない。

## Arena接続

`Arena`はstable `ArenaMap`、current `RuntimeTopology`、current `RuntimeAreaGraph`を別fieldとして持つ。`reset()`は`createRuntimeTopology()`直後に`createRuntimeAreaGraph()`を一度呼ぶ。`applyTopologyMutations()`はatomic mutationが新snapshotを返した場合だけtopologyを交換し、その直後にgraphを再構築して既存terrain rebuildへ進む。rejected/no-opの時点ではgraph、描画、cacheを更新しない。

DEV buildだけが既存の`window.__arenaScene`を公開する。E2Eはこの既存入口で`areaGraph`を観測する。音響表示のnative mode selectは[acoustic-graph-v1 仕様](acoustic-graph-v1.md)が所有する描画controlであり、graphのdebug command、URL query、HUD data attribute、production global APIを追加しない。productionではSceneもgraphも`window`へ公開しない。

## 検証契約

- unit: 3×3 area、area外の2×2 corridor、細いjunction、同kind 4近傍component、異node edge、tile/neighbor query、同一入力の決定性、入力topology不変。
- E2E: 既存の通常wall→floor操作でgraph snapshotが交換され、graph/topology revisionが一致し、新floor nodeが存在する。retry後は両revisionが0。
