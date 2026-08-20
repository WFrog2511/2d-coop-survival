---
id: DESIGN-BASIC-ACOUSTIC-GRAPH-V1
requirements: REQ-ACOUSTIC-GRAPH-V1
specification: SPEC-ACOUSTIC-GRAPH-V1
---

# acoustic-graph-v1 基本設計

## 関連

- [要件](../../20_requirements/acoustic-graph-v1.md)
- [仕様](../../30_specs/acoustic-graph-v1.md)
- [runtime-area-graph-v1 基本設計](runtime-area-graph-v1.md)
- [Issue #62](https://github.com/WFrog2511/2d-coop-survival/issues/62)、[Issue #76](https://github.com/WFrog2511/2d-coop-survival/issues/76)、[Issue #102](https://github.com/WFrog2511/2d-coop-survival/issues/102)

音響伝播はcurrent terrainからすでに導出済みの`RuntimeAreaGraph`を読む純粋なnode snapshotとする。node Dijkstraが「どの区画まで届くか」を決め、tile BFSは到達済みnodeを見せるためだけに使う。この分離により、将来の敵知覚が描画用tile経路へ依存しない。

~~~mermaid
flowchart LR
  action["成功 player action"] --> arena["Arena emit"]
  topology["RuntimeTopology revision"] --> graph["RuntimeAreaGraph node/edge"]
  graph --> dijkstra["pure node Dijkstra"]
  dijkstra --> logical["SoundPropagationSnapshot"]
  graph --> render["reached node内 BFS"]
  logical --> render
  render --> view["shared time view"]
  view --> world["Phaser Graphics"]
  view --> minimap["observed-only Canvas"]
  logical -. future input only .-> ai["Enemy hearing / hate"]
~~~

`Arena`はcurrent topologyとarea graphが同revisionである時だけsnapshotを採用する。terrain mutationでgraphが作り直されたらold waveをclearするため、旧node IDや旧tileを新terrainへ対応付けない。worldとminimapは同じ`SoundWaveTile` viewを共有し、visibility maskと既観測terrainの制約は既存側へ残す。

action別のstrength、表示速度、色、alpha、実音は`acoustic-data.ts`へまとめる。edge crossing costは正、node traversal costは非負とし、実音は既存`ArenaEffects`を通す。論理strengthと音量を同じ数値へ結び付けない。dashは`PlayerDash` stateに開始位置と未発生flagを持ち、最初の実変位だけでwaveと実音を一度発生させる。壁密着の0距離dashは発生させない。

`ponytail: node内の入口別・portal別距離は扱わない。複数入口を区別しないことで戦術または敵知覚の誤差が問題になった時だけ、node boundary stateを追加する。`

## 対象外

敵AI、ヘイト、聴覚結果の保存、event bus、専用audio engine、dynamic blocker、差分Dijkstra、複数player音源の合成は実装しない。後続の敵知覚境界は[Issue #76](https://github.com/WFrog2511/2d-coop-survival/issues/76)で扱う。
