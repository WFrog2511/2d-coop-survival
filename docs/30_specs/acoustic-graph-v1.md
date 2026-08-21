---
id: SPEC-ACOUSTIC-GRAPH-V1
requirements: REQ-ACOUSTIC-GRAPH-V1
---

# acoustic-graph-v1 仕様

## 関連

- [REQ-ACOUSTIC-GRAPH-V1](../20_requirements/acoustic-graph-v1.md)
- [runtime-area-graph-v1 仕様](runtime-area-graph-v1.md)
- [Issue #62](https://github.com/WFrog2511/2d-coop-survival/issues/62)、[Issue #76](https://github.com/WFrog2511/2d-coop-survival/issues/76)、[Issue #102](https://github.com/WFrog2511/2d-coop-survival/issues/102)

## 公開pure API

`src/runtime-acoustic-graph.ts`は`RuntimeAreaGraph`だけを入力にする。`RuntimeTopology`、Phaser object、HUD、timerを公開APIへ渡さない。

| export | 契約 |
| --- | --- |
| `AcousticPropagationCosts` | 0より大きい`edgeCrossingCost`と、0以上の`area`/`junction`/`corridor` `baseCost`、`perTileCost`を持つreadonly調整値 |
| `AcousticNodePropagation` | 到達node ID、最小`arrivalCost`、残りstrength、source以外の`predecessorNodeId` |
| `SoundPropagationSnapshot` | graph revision、source tile/node、initial strength、graph node順の到達node群 |
| `createSoundPropagationSnapshot(graph, source, strength, costs)` | node Dijkstraで論理snapshotを導出する。source外・graph不整合は`undefined`、不正strength/costはthrow |
| `SoundPropagationRenderSnapshot` | 到達nodeだけから一度導出したrender tile群。tileはnode ID、node到達cost、node内距離を持つ |
| `createSoundPropagationRenderSnapshot(graph, snapshot)` | revision、known node、predecessor、境界seedが全て整合するときだけrender snapshotを返す。不整合は`undefined` |
| `soundWaveTilesAt(render, elapsedMs, timing)` | `arrivalCost * costTravelMs + intraNodeDistance * tileTravelMs`で現在表示するtileとalphaを返す |
| `soundWaveLifetimeMs(render, timing)` | render snapshotを表示し終える時刻を返す |

## node伝播

source nodeの`arrivalCost`は0である。未確定nodeから、最小の`arrivalCost`、同値ならgraph node順で一つを選ぶ。current nodeからneighbor nodeへのcandidateは次式とする。

```text
candidate = current.arrivalCost
  + currentNode.baseCost
  + currentNode.tileCount * currentNode.perTileCost
  + edgeCrossingCost
```

`edgeCrossingCost`は0より大きい有限値であり、node traversal costは0を許容する。`candidate <= strength`のnodeだけを到達とする。既存candidateより小さいcostを優先し、同costではpredecessorのgraph node順が早い方を選ぶ。出力`nodes`はgraph node順であり、入力のgraph、source、costsを変更しない。

## render専用tile展開

1. render側はgraph revisionとsnapshot revisionが一致し、source tileがsource nodeに属することを確認する。
2. source nodeはsource tileだけをdistance 0 seedにする。
3. 後続nodeは、predecessor nodeと4近傍で接する当該node内の全tileをdistance 0 seedにする。
4. seedから4近傍BFSを行うが、同一到達node内のtileだけを候補にする。
5. 一つでもunknown node、predecessor chain、node境界、node内接続が不整合なら、部分的なtile列を返さず`undefined`にする。

このBFSは到達性を決めない。未到達nodeはseedにも候補にもならない。

## Arena接続

`Arena.emitSoundWave()`は成功action後にcurrent `areaGraph`からnode snapshotとrender snapshotを一度ずつ作る。active waveは両snapshotとaction profile、発生時に固定した通常表示への採用可否を保持する。描画更新はrevisionがcurrent topology/graphと一致する採用済みwaveだけを`SoundWaveTile`へ変換し、`通常`modeでは同じviewをworld `Graphics`と`ArenaHud.updateMinimap()`へ渡す。

`src/acoustic-data.ts`の`SoundActionProfile`は`strength`、`costTravelMs`、`tileTravelMs`、`trailMs`、world/minimap色とalpha、WebAudio profileを持つ。`ACOUSTIC_PROPAGATION_COSTS`はnode Dijkstra用の共通costを持つ。数値自体は試遊調整値であり、自動testの固定期待値にしない。

成功fire、通常移動、成功pickupと、開始位置から最初の実変位を確認した成功dashの既存発生条件は維持する。dash stateは開始位置と未発生flagを持ち、その実変位時にwaveと実音を一度だけ発生させる。壁密着など移動量0のdashは発生させない。通常表示への採用数が描画上限へ達した後のwaveも論理snapshotとして自然expiryまで保持し、既に採用済みのwaveを古い順に削除しない。retry/new run/terminal/terrain revision交換では全wave/viewをclearする。

## 表示modeとdebug view

ページ上のnative selectは`off`、`normal`、`debug`を持ち、初期値は`normal`である。modeはDOMだけの一時UI状態であり、pure API、保存、通信、URL parameter、production向けdebug APIにはしない。

| mode | world / minimapの描画契約 |
| --- | --- |
| `off` | 音響のworld `Graphics`とミニマップの音波描画を行わない。論理waveの生成・expiryは継続する。 |
| `normal` | 発生時に採用されたrender waveだけを、既存visibility maskと既観測terrainの制約の下でworld/minimapへ共有する。 |
| `debug` | 通常tile波を描かず、生成時`ArenaMap.rooms`、current `RuntimeAreaGraph`の全node/edge、最新の同revision logical waveのsource・到達node・predecessor edgeを`AcousticDebugView`としてworld/minimapへ共有する。到達時刻は`arrivalCost * costTravelMs`で決め、tile BFSの距離を用いない。調査用として未踏地を含む全graphを意図的に開示する。 |

debugは通常表示へ採用されなかった最新logical waveも扱える。logical waveがない、またはcurrent graphとrevisionが異なるときは、roomsとcurrent graphだけを描き、source/reached/predecessorを表示しない。native controlのpointer操作はCanvasへ渡さず、focus中のkeyboard操作はゲーム入力として扱わない。retry/new runとterrain mutation後も選択modeは維持するが、論理waveとdebug eventはclearする。ページ再読込時は`normal`へ戻る。

## DEV観測と検証

DEV buildの既存`window.__arenaScene`だけをE2E観測に使う。新しいproduction API、HUD attribute、debug command、URL parameterは追加しない。E2Eは成功射撃のnode snapshot、predecessor、render node subset、三modeの描画分離、通常表示上限とlogical retentionの分離、debugにおける最新logical event・world/minimap共有・未観測nodeの開示、retry/mutation clear、mode focus中の入力隔離と、実移動dash一回・壁密着dash無発生を確認する。

敵AI・ヘイト・聴覚への接続は[Issue #76](https://github.com/WFrog2511/2d-coop-survival/issues/76)まで対象外である。
