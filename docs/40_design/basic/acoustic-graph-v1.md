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
  render --> normal["normal shared tile view"]
  normal --> world["Phaser Graphics + visibility mask"]
  normal --> minimap["observed-only Canvas"]
  graph --> debug["latest logical graph debug"]
  logical --> debug
  debug --> debugWorld["world full graph overlay"]
  debug --> debugMinimap["minimap full graph overlay"]
  logical -. future input only .-> ai["Enemy hearing / hate"]
~~~

`Arena`はcurrent topologyとarea graphが同revisionである時だけsnapshotを採用する。terrain mutationでgraphが作り直されたらold waveをclearするため、旧node IDや旧tileを新terrainへ対応付けない。通常表示への採用はemit時だけに決め、表示負荷の上限後もlogical snapshotは自然expiryまで残す。`通常`ではworldとminimapが同じ`SoundWaveTile` viewを共有し、visibility maskと既観測terrainの制約は既存側へ残す。

ページのnative selectは`非表示`、`通常`、`音響デバッグ`を切り替える。`非表示`でもlogical propagationを止めない。`音響デバッグ`は通常tile波の代わりに、生成metadataのrooms、current graphのarea/junction/corridor nodeとedge、最新logical eventのsource・到達・predecessorを一つの`AcousticDebugView`からworld/minimapへ描く。debugは未踏地を意図的に見せる調査用表示であり、通常ミニマップの霧契約には含めない。modeはrun stateへ保存せず、retry/new run後もDOM選択を維持する。selectへfocusしている間はPhaser入力を受け取らない。

action別のstrength、表示速度、色、alpha、実音は`acoustic-data.ts`へまとめる。edge crossing costは正、node traversal costは非負とし、実音は既存`ArenaEffects`を通す。論理strengthと音量を同じ数値へ結び付けない。dashは`PlayerDash` stateに開始位置と未発生flagを持ち、最初の実変位だけでwaveと実音を一度発生させる。壁密着の0距離dashは発生させない。

`ponytail: node内の入口別・portal別距離は扱わない。複数入口を区別しないことで戦術または敵知覚の誤差が問題になった時だけ、node boundary stateを追加する。`

## 対象外

敵AI、ヘイト、聴覚結果の保存、event bus、専用audio engine、dynamic blocker、差分Dijkstra、複数player音源の合成は実装しない。map形状の改善やroom/portal意味論の追加は[Issue #104](https://github.com/WFrog2511/2d-coop-survival/issues/104)で扱う。後続の敵知覚境界は[Issue #76](https://github.com/WFrog2511/2d-coop-survival/issues/76)で扱う。
