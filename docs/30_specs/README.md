# Specifications

実装とテストが参照できる検証可能な振る舞い、公開インターフェース、E2Eシナリオを置きます。

## Index

- [ammo-material-v1 仕様](ammo-material-v1.md): 3素材と7武器の対応、個別WeaponInstance、partial reload、world素材、role別reload、旧callback無効化。
- [wave-progression-v1 仕様](wave-progression-v1.md): RunState schedule、preparation/combat/rest境界、combat epoch、enemy event、HUD/data-testidの検証契約。
- [player-actions-v1 仕様](player-actions-v1.md): 回避、近傍pickup selector、開始ゲート、DEV E2E経路の検証契約。
- [gunslinger-v1 仕様](gunslinger-v1.md): 調整定数、回避overlap、共通撃破経路、combo/buff HUDの検証契約。
- [inventory-v1 仕様](inventory-v1.md): world weapon model、共通2行E prompt、quick/backpack state、Tab drag/drop、terminal/retryの検証契約。
- [standard-arena-map-v2 仕様](standard-arena-map-v2.md): 中央予約metadata、map instance bounds、最後に見たterrainと現在可視markerのミニマップ契約。
- [runtime-topology-v1 仕様](runtime-topology-v1.md): current tilesのclone・atomic validation・revision、terrain-only rebuild、DEV E2Eの検証契約。
- [runtime-area-graph-v1 仕様](runtime-area-graph-v1.md): area / junction / corridor分類、component/edge、決定性、Arena再導出の検証契約。
