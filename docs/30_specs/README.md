# Specifications

実装とテストが参照できる検証可能な振る舞い、公開インターフェース、E2Eシナリオを置きます。

## Index

- [ammo-material-v1 仕様](ammo-material-v1.md): 3素材と7武器の対応、個別WeaponInstance、partial reload、world素材、role別reload、旧callback無効化。
- [wave-progression-v1 仕様](wave-progression-v1.md): 8 phase RunState、Night 1 enemy epoch、Boss撃破event、HUD/data-testidの検証契約。
- [player-actions-v1 仕様](player-actions-v1.md): 回避、近傍pickup selector、開始ゲート、DEV E2E経路の検証契約。
- [gunslinger-v1 仕様](gunslinger-v1.md): 調整定数、回避overlap、共通撃破経路、combo/buff HUDの検証契約。
- [inventory-v1 仕様](inventory-v1.md): world weapon model、共通2行E prompt、quick/backpack state、Tab drag/drop、terminal/retryの検証契約。
- [standard-arena-map-v2 仕様](standard-arena-map-v2.md): 2tile幅通路、中央予約の2layer annulus、空obstacles、map instance bounds、最後に見たterrainと現在可視markerのミニマップ契約。
- [runtime-topology-v1 仕様](runtime-topology-v1.md): current tilesのclone・atomic validation・revision、terrain-only rebuild、DEV E2Eの検証契約。
- [runtime-area-graph-v1 仕様](runtime-area-graph-v1.md): 3×3 area / 2×2 corridor / 細いjunction分類、component/edge、決定性、Arena再導出の検証契約。
- [acoustic-graph-v1 仕様](acoustic-graph-v1.md): node Dijkstra、predecessor境界seed、三mode、通常表示とlogical retentionの分離、shared debug、safe failureの検証契約。
