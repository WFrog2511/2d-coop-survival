---
id: DESIGN-BASIC-RUNTIME-AREA-GRAPH-V1
requirements: REQ-RUNTIME-AREA-GRAPH-V1
specification: SPEC-RUNTIME-AREA-GRAPH-V1
---

# runtime-area-graph-v1 基本設計

`RuntimeAreaGraph`は生成時metadataでもPhaser runtimeでもなく、current `RuntimeTopology`を読む純粋な派生snapshotとする。これにより、後続のAI、音響、Boss経路は同じcurrent terrainから必要な空間構造を読める。`area`は3×3の開放正方形、area外の2×2帯は`corridor`、それ以外の細い分岐は`junction`として分類する。今回のgraph自体は行動を起こさない。

~~~mermaid
flowchart LR
  map["ArenaMap: stable seed/rooms"] --> topology["RuntimeTopology: current tiles/revision"]
  topology --> graph["RuntimeAreaGraph: area/junction/corridor"]
  graph -. current input .-> acoustic["Acoustic debug / future hearing"]
  graph -. future .-> ai["Enemy AI / Boss"]
  topology --> phaser["Phaser terrain / collider / minimap"]
~~~

`Arena.reset`は新しいtopologyとgraphを同じrevision 0で作る。成功したatomic terrain mutationだけが両snapshotを置き換え、その後に既存のterrain rebuildとcache refreshを行う。stable `ArenaMap.rooms`と`corridors`は生成履歴として保ち、graphのnodeへ置換しない。音響debugはcurrent graphを描画用に読むだけで、分類、node ID、edge、lifecycleを変更しない。

`ponytail: graphは全体再導出に限定する。terrain mutation頻度が一runで多数になり、計測で全体再導出が問題になった時だけ差分更新を再検討する。`

## 対象外

graphを使うAI、Boss、anchor、Cable、dynamic blocker、プレイヤー向けnavigation UI、event busは後続sliceで扱う。音響debugの表示契約は[acoustic-graph-v1 基本設計](acoustic-graph-v1.md)が所有し、本graphへdebug commandを作らない。map形状やroom/通路の視覚的な改善は[Issue #104](https://github.com/WFrog2511/2d-coop-survival/issues/104)へ残す。今回のDEV観測は既存Scene公開を再利用する。
