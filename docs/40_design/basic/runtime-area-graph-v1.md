---
id: DESIGN-BASIC-RUNTIME-AREA-GRAPH-V1
requirements: REQ-RUNTIME-AREA-GRAPH-V1
specification: SPEC-RUNTIME-AREA-GRAPH-V1
---

# runtime-area-graph-v1 基本設計

`RuntimeAreaGraph`は生成時metadataでもPhaser runtimeでもなく、current `RuntimeTopology`を読む純粋な派生snapshotとする。これにより、後続のAI、音響、Boss経路は同じcurrent terrainから必要な空間構造を読める。今回のgraph自体は行動を起こさない。

~~~mermaid
flowchart LR
  map["ArenaMap: stable seed/rooms"] --> topology["RuntimeTopology: current tiles/revision"]
  topology --> graph["RuntimeAreaGraph: area/junction/corridor"]
  graph -. future .-> ai["Enemy AI / Acoustic / Boss"]
  topology --> phaser["Phaser terrain / collider / minimap"]
~~~

`Arena.reset`は新しいtopologyとgraphを同じrevision 0で作る。成功したatomic terrain mutationだけが両snapshotを置き換え、その後に既存のterrain rebuildとcache refreshを行う。stable `ArenaMap.rooms`と`corridors`は生成履歴として保ち、graphのnodeへ置換しない。

`ponytail: graphは全体再導出に限定する。terrain mutation頻度が一runで多数になり、計測で全体再導出が問題になった時だけ差分更新を再検討する。`

## 対象外

graphを使うAI、音響、Boss、anchor、Cable、dynamic blocker、UI、event busは後続sliceで扱う。今回のDEV観測は既存Scene公開を再利用し、製品向けgraph表示やdebug commandは作らない。
