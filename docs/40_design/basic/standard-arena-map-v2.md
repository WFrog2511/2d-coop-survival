---
id: DESIGN-BASIC-STANDARD-ARENA-MAP-V2
requirements: REQ-STANDARD-ARENA-MAP-V2
specification: SPEC-STANDARD-ARENA-MAP-V2
implementation_issue: https://github.com/WFrog2511/2d-coop-survival/issues/64
---

# standard-arena-map-v2 基本設計

> **runtime-topology-v1への限定supersede**: [runtime-topology-v1 基本設計](runtime-topology-v1.md) はstable mapとcurrent terrainの分離、terrain-only rebuildだけを追加する。本書の生成、中央予約、単独プレイヤー用ミニマップ、その他の設計境界は履歴兼参照として残す。

## 責務分割

| 境界 | 責務 |
| --- | --- |
| `src/arena-map.ts` | 標準mapの決定的生成、2tile幅の通常/fallback通路、2layer中央予約annulus、空のobstacles、予約領域を避ける部屋・通路、BFS、instance寸法でのviewport clamp |
| `src/main.ts` | Phaserの描画・wall collider・camera / physics bounds、中央予約の最小表示、既存LOSからの観測状態、retry reset |
| `src/arena/hud.ts` | DOM上の最小Canvasミニマップと、既知地形・現在視界・可視markerの描画 |
| `index.html` / `style.css` | 入力を持たない右上ミニマップと、その直下のrun panelのレイアウト |
| `tests/arena-map.test.ts` | map設定・metadata・BFSから導かれる不変条件 |
| `e2e/prototype.spec.ts` | 実際のrunでの探索、可視marker、retry、入力非干渉 |

## データと流れ

`ArenaMap` は生成時のtile配列とrun固有の幅・高さ・tileSizeを正本とする。標準生成では `CentralReserve` を追加し、中央のsealed矩形、2layer floor annulus、その内側layerの4方向approachを提供する。通常/fallbackのL字通路は2tile幅へそろえ、現行生成では部屋内障害物を置かず`obstacles`を空にする。current terrainの描画・物理化・UI入力は後続の`RuntimeTopology`を使い、seedとmetadataはstable mapに残す。

~~~mermaid
flowchart LR
  seed[seed] --> generator[src/arena-map.ts]
  generator --> map[ArenaMap + CentralReserve]
  map --> runtime[src/main.ts Phaser runtime]
  runtime --> los[既存LOS]
  los --> observed[observedTiles snapshot]
  los --> visible[visibleTileKeys]
  observed --> hud[src/arena/hud.ts minimap]
  visible --> hud
  runtime --> hud
~~~

`observedTiles` は探索履歴ではなく「最後に見たterrain」の小さなmapである。可視tileを更新するたびにその時点の `Tile` を上書きし、非可視後は保存済みの値を描く。enemyやpickupは履歴へ保存せず、フレーム時点で可視のものだけをHUDへ送る。

## reset境界

retry / new runは既存のgenerationとtimer停止の境界を維持する。その直後に古い観測mapをclearし、新しい `ArenaMap` の初期LOSだけを再記録する。HUD listenerや別のLOS計算は増やさない。

## Ponytailの境界

既存のPhaser Graphics、Canvas 2D、DOM HUD、BFS、LOSを再利用する。限定的なterrain mutationは後続の[runtime-topology-v1 基本設計](runtime-topology-v1.md)へ移した。room graph、team視界、network、tactical UI、汎用minimap abstractionはこの1実装しか持たない段階では導入しない。current topologyの3×3 area分類と音響debugは別設計へ分離し、生成の見た目やloopの追加調整は[Issue #104](https://github.com/WFrog2511/2d-coop-survival/issues/104)まで広げない。

`ponytail: 単独プレイヤーの最後に見たterrainと現在可視markerだけをCanvasへ描く。team / drone / ping /地形変化が同時に必要になった時に、観測状態の共有境界を再検討する。`
