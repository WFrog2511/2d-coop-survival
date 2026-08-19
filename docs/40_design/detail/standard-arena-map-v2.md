---
id: DESIGN-DETAIL-STANDARD-ARENA-MAP-V2
requirements: REQ-STANDARD-ARENA-MAP-V2
specification: SPEC-STANDARD-ARENA-MAP-V2
---

# standard-arena-map-v2 詳細設計

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | 標準113×71 map、中央13×13予約領域、instance bounds、最小ミニマップ |
| 対応する基本設計 | [DESIGN-BASIC-STANDARD-ARENA-MAP-V2](../basic/standard-arena-map-v2.md) |
| 対応する要件 | [REQ-STANDARD-ARENA-MAP-V2](../../20_requirements/standard-arena-map-v2.md) |
| 対応する仕様 | [SPEC-STANDARD-ARENA-MAP-V2](../../30_specs/standard-arena-map-v2.md) |
| 関連Issue | [Issue #64](https://github.com/WFrog2511/2d-coop-survival/issues/64)、[Issue #83](https://github.com/WFrog2511/2d-coop-survival/issues/83)、[Issue #74](https://github.com/WFrog2511/2d-coop-survival/issues/74) |
| ステータス | Prototype standard の試遊後安定化 |
| 同期方法 | TypeScriptのため手動review。自動生成ブロックと新規transformは置かず、[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31) でTypeScript対応を扱う |

## 1. 目的

探索に十分な標準mapと、中央の将来用途を塞がずに可視性を保つ最小の地図表示を定める。実装は既存の決定的生成、BFS、LOS、Phaser runtimeを再利用し、プレイヤーが境界・予約領域・探索済み地形を確認できる状態にする。

## 2. 対象範囲

| 対象 | 内容 |
| --- | --- |
| map生成 | 奇数113×71、中心13×13 sealed reserve、4方向approach、通常/fallbackの決定性 |
| runtime | map instanceを基準にしたworld / camera / physics /描画 /viewport bounds |
| 画面 | 中央予約の最小Graphics、右上のpointer-eventsなしCanvasミニマップ |
| 観測 | 最後に見たterrain、現在可視terrain、player、現在可視dynamic marker、retry reset |

| 対象外 | 理由 |
| --- | --- |
| RuntimeTopology、room graph、loop、Acoustic Graph | 後続の構造・敵AI sliceで判断する |
| terrain mutation、boss、map resize | 現在の生成・試遊契約を超える |
| team / drone / down / network / tactical / ping /正式UI | 単独プレイヤーの最小表示だけを先に確認する |

## 3. データ設計と手動同期

| データ | 所有者 | 契約 |
| --- | --- | --- |
| `ArenaMap` | `src/arena-map.ts` | run固有の幅・高さ・tileSize、tile配列、start、生成済み標準mapの`centralReserve` |
| `CentralReserve` | `src/arena-map.ts` | inclusive boundsと`up/right/down/left`のapproaches。予約内部はwall、approachは到達可能floor |
| `observedTiles` | `src/main.ts` | `Map<string, Tile>`。可視になった時点のterrainを最後に見た値として保存する |
| `visibleTileKeys` | `src/main.ts` | 現在のLOS結果だけを持ち、visibility更新ごとに再構築する |
| `MinimapView` | `src/arena/hud.ts` | map、観測snapshot、現在視界、`terrainChanged`、player、現在可視markerをCanvas描画へ渡す |
| terrain cache | `src/arena/hud.ts` | in-memory Canvas。観測または現在視界のterrainが変わった時だけ再描画する |

TypeScript sourceは現行DOCGEN transformの対象外である。この文書にはDOCGEN予約・生成ブロックを置かない。`src/arena-map.ts`、`src/main.ts`、`src/arena/hud.ts`、対象unit、代表E2Eを手動reviewして同期する。

## 4. 生成とruntimeフロー

~~~mermaid
flowchart TD
  reset[run開始またはretry] --> generate[seedからArenaMapを生成]
  generate --> reserve[予約内部をwall、外周ringをfloorにする]
  reserve --> validate[全floorと4approachをBFSで確認]
  validate --> build[Graphics・wall collider・boundsをmap寸法から構築]
  build --> visible[既存LOSでvisibleTileKeysを更新]
  visible --> snapshot[可視TileをobservedTilesへ保存]
  snapshot --> minimap[既知terrainと現在markerをCanvas描画]
  minimap --> play[既存の移動・射撃・pickup]
  play --> reset
~~~

通常生成が失敗した場合は、既存のfallback生成を使う。ただしfallbackも同じ予約metadata、wall、approach、BFS契約を満たす。retryは既存の次seed選択を使い、古いgenerationのtimerを停止した後に観測状態をclearする。

## 5. ミニマップ描画と入力

1. `updateVisibilityMask()` が既存LOSの結果を使って `visibleTileKeys` を作り直し、同数でもkeyが異なる場合を含めて観測・現在視界のterrain変更を検出する。
2. 各visible keyについて、その時点の `map.tiles[y][x]` を `observedTiles` へ保存する。
3. `terrainChanged`、初回、Canvas寸法変更時だけ、in-memory Canvasへ背景、暗色の`observedTiles`、明色の現在可視terrainを再描画する。retryとmap変更もこの契機に含む。
4. `updateMinimap()` は毎frame、terrain cacheを`drawImage()`し、その上へ現在可視markerとplayerだけを描く。
5. marker候補はruntimeから毎回作り直し、visible keyにないenemy、weapon、ammo、scrapは渡さない。
6. DOM data属性は代表E2Eの観測面だけであり、ゲームルールやbalanceの公開debug APIにはしない。

`#minimap-panel` は `pointer-events: none` であり、keyboard focusを取らない。Tab、移動、射撃、retryは既存のCanvas / DOM listenerへそのまま届く。

## 6. 失敗時動作

| 条件 | 動作 | 回復導線 |
| --- | --- | --- |
| 生成候補が連結性を満たさない | 既存の候補retry後にfallbackを使用する | 新規依存なしでrunを開始する |
| 観測keyがmap外または不正 | HUD描画だけをskipする | 次回visibility更新で正しいkeyを再描画する |
| terminal | dynamic markerを渡さない | retryで新mapと新しい観測状態を構築する |
| DOM Canvas contextがない | minimap描画をskipする | 既存game runtimeと入力は継続する |

## 7. テスト観点

| レベル | 観点 | 期待結果 |
| --- | --- | --- |
| unit | map寸法、中心予約、全予約wall、4approach、BFS、viewport instance clamp | 部屋数や絶対座標に依存せず構造契約を満たす |
| E2E | run開始、minimapの寸法・探索数・現在可視marker | 現在のLOSだけがdynamic markerを表示する |
| E2E | retryとkeyboard入力 | 前runの観測を残さず、ミニマップが入力を妨げない |
| 手動試遊 | 113×71の探索量、中央表示、ミニマップの読みやすさ | 数値・見た目を調整する必要があるか判断する |

## 8. 変更履歴

| 日付 | 変更内容 | 理由 |
| --- | --- | --- |
| 2026-08-18 | 初版作成 | Issue #64の試遊後に、標準mapと最小ミニマップの現在契約を固定 |
| 2026-08-18 | terrain cacheと`terrainChanged`を追記 | 大きな標準mapでも毎frameのterrain再描画を避ける |
