---
id: SPEC-STANDARD-ARENA-MAP-V2
requirements: REQ-STANDARD-ARENA-MAP-V2
---

# standard-arena-map-v2 仕様

> **runtime-topology-v1への限定supersede**: [runtime-topology-v1 仕様](runtime-topology-v1.md) はcurrent terrainの所有者とmutation後のruntime入力だけを更新する。`ArenaMap`の生成、寸法、seed、start、中央予約metadataと、本書のそれ以外のミニマップ契約は変更しない。

## 標準mapと予約metadata

- `generateArenaMap(seed)` と `generateFallbackArenaMap(seed)` が返す標準 `ArenaMap` は、`width=113`、`height=71`、`tileSize=40`、奇数の幅・高さを持つ。
- 中心は `{ x: floor(width / 2), y: floor(height / 2) }` とする。`CENTRAL_RESERVE_SIZE_TILES=13` の半幅を `6` とし、`centralReserve.bounds` は中心から各方向へ半幅ぶん広げたinclusiveな矩形である。
- 現行Standard設定では中心はzero-basedで`(56,35)`、予約矩形は`x=50..62`、`y=29..41`となる。
- 生成済み標準mapの `centralReserve` は必須であり、`approaches` は `up`、`right`、`down`、`left` の4件を持つ。位置はそれぞれ予約矩形の上、右、下、左へ1tile隣接した中心線上とする。
- 予約矩形の全tileは `wall` である。部屋、通路、障害物の処理後に予約矩形をwallへ戻し、予約矩形の外周ringをfloorとして残す。各approachはfloorであり、`findPath(map, map.start, approach)` は空配列ではない。
- seed、rooms、corridors、obstacles、tile配列、`centralReserve` は同じ入力seedで決定的に再現する。`generateNextArenaMap` の既存の異なるtile配置選択規則は維持する。

## runtime境界

- 生成時の`ArenaMap.width`、`ArenaMap.height`、`ArenaMap.tileSize`はrun寸法の正本である。current terrainを読むcamera bounds、Arcade Physics world bounds、床grid、wall Graphics、wall collider、world/tile変換、viewport clampには、後続の`RuntimeTopology`が同じ寸法と現在tileを提供する。
- 中央予約領域は既存Graphics上で淡い識別色のborder・fillと、4接近候補の小さな印を描く。これは進入不可な地形を置き換えるものではない。
- `viewportTileRect(view, map)` は第二引数のmap寸法と`tileSize`でworld座標をtileへ変換し、left/top/right/bottomをclampする。第二引数を省略した場合だけ標準設定を使う。

## ミニマップの観測状態

- `Arena.updateVisibilityMask()` は既存の `hasLineOfSight()` による一回のtile走査で `visibleTileKeys` を再構築する。同じ更新で、可視tileの `Tile` 値を `observedTiles: Map<string, Tile>` へ保存する。
- `observedTiles` は最後に視認した地形のスナップショットである。ミニマップの非可視部分はこの値だけを描き、現在の `map.tiles` を読み直さない。可視部分だけは現在の `map.tiles` を明るく重ね描きする。
- `ArenaHud.updateMinimap()` はmap寸法からCanvas上の1tileの幅と高さを算出する。未観測領域は背景色のままとし、観測済み地形は暗色、現在視界は明色で描く。
- `markers` はplayer以外に `enemy`、`weapon`、`ammo`、`scrap` を取り得る。activeで、通常enemyまたはworld item / ammo boxであり、かつ現在可視tileにあるものだけを渡す。視界外やterminal中は渡さない。
- ミニマップCanvasは `data-testid="minimap"` を持ち、`data-width`、`data-height`、`data-observed-tiles`、`data-visible-tiles`、`data-player-tile`、`data-visible-markers` を非balanceなE2E観測値として更新する。

## resetと入力

- runのreset開始時に `observedTiles` と `visibleTileKeys` をclearし、新mapの初期visibility更新後だけ新しい観測値を描画する。旧runのdynamic markerも残さない。
- `#minimap-panel` は右上に常時表示し、`pointer-events: none` とする。`#run-panel` はその直下へ配置するため、ミニマップがkeyboardやCanvas pointer入力のhit targetにならない。

## 検証契約

- `tests/arena-map.test.ts` は固定した部屋数や絶対座標ではなく、map設定・`centralReserve` metadata・BFSから導く寸法、予約wall、4接近候補、連結性、instance viewport clampを検査する。
- `e2e/prototype.spec.ts` は右上ミニマップのmap寸法、探索で増える観測数、現在可視world marker、retry後の新run観測、および入力非干渉を代表経路として検査する。
