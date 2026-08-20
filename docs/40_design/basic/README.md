# Basic Design

システム境界、構成、画面、API、データ、権限、運用の基本方針を置きます。

## Index

- [ammo-material-v1 基本設計](ammo-material-v1.md): 設定の単一入口、WeaponInstance、既存bullet pool、world素材、reload Timerとgeneration guardの設計。
- [wave-progression-v1 基本設計](wave-progression-v1.md): 既存directional spawnをcombat epochから維持するpreparation/combat/rest RunState adapter設計。
- [combat-choice-v1 基本設計](combat-choice-v1.md): WeaponModel、quick/backpack drag/drop inventory、shared sidearm ammoを既存combat stateへ限定統合する設計。
- [standard-arena-map-v2 基本設計](standard-arena-map-v2.md): map生成・Phaser runtime・Canvas HUDの最小責務分割と探索状態の流れ。
- [runtime-topology-v1 基本設計](runtime-topology-v1.md): stable mapとcurrent terrainの分離、terrain-only Phaser rebuild、最小DEV入口。
- [runtime-area-graph-v1 基本設計](runtime-area-graph-v1.md): current topologyから派生する最小空間graphと後続AI境界。
- [acoustic-graph-v1 基本設計](acoustic-graph-v1.md): node伝播正本とrender-only tile表示をworld/minimapへ共有する設計。
