---
id: SPEC-RUNTIME-TOPOLOGY-V1
requirements: REQ-RUNTIME-TOPOLOGY-V1
---

# runtime-topology-v1 仕様

## データ境界

- `ArenaTerrain` は`width`、`height`、`tileSize`、`tiles`だけを持つ構造型である。`isFloor`、BFS、LOS、visibility、spawn、drop、viewportはこの型を受け取る。
- `RuntimeTopology` は`ArenaTerrain`へ`revision: number`を加えたimmutable snapshotである。`tiles`は外部から書き換えないreadonly構造として公開する。
- `createRuntimeTopology(map)` は寸法とtileSizeを保ち、各rowを複製して`revision: 0`を返す。`seed`、`start`、room、corridor、obstacle、`centralReserve`は保持しない。
- `applyRuntimeTopologyMutations(topology, mutations, centralReserve)` はstable map側の必須`centralReserve`をguardとして受け取る。TypeScript上の引数省略を許可せず、実行時にmetadataが欠ければvalidationより先にthrowする。重複位置はbatch内の最後の値を最終状態として扱う。

## batch検証とrevision

- 各mutationは`{ x, y, tile }`であり、`x`と`y`は整数、`tile`は`wall`または`floor`でなければならない。
- 座標は`0 <= x < width`かつ`0 <= y < height`である。`x=0`、`y=0`、`x=width-1`、`y=height-1`の外周は常にrejectionする。
- 必須`centralReserve.bounds`のinclusive rectangle内の変更をrejectionする。approachの扱い、map生成、reservation metadataは本仕様で変更しない。
- validationは全入力を適用前に完了する。不正入力が一件でもあればthrowし、tile配列・revision・既存snapshotを変更しない。
- 最終tile値がcurrent値と同じ位置だけのbatchは元のsnapshotを返す。変更があれば全rowを複製して最終値を反映し、`revision + 1`の新snapshotを返す。

## runtime統合

- `Arena` はstable `ArenaMap` とcurrent `RuntimeTopology`を別fieldとして持つ。mapのseed、start、中央予約表示はstable mapを使い、terrain readはtopologyへ渡す。
- run resetではstable mapを生成または次mapへ更新してからtopologyを作り、terrainとitem初期化を行う。terrain rebuildはGraphicsと`walls` static groupだけをclearして再作成する。item groupとstate mapはreset時だけclearする。
- topologyが変わった後はpath cacheとenemy visibility cacheをclearし、visibility-maskのplayer cacheを無効化する。強制LOS更新で`observedTiles`と`visibleTileKeys`を更新し、current topologyを`ArenaHud.updateMinimap()`へ渡す。
- `debugOpenWall(tile)` はDEV時だけ受け付け、current tileが通常`wall`の場合に限って`floor`変更をbatch APIへ渡す。production、floor→wall、wall damage経路は追加しない。

## 検証契約

- `tests/runtime-topology.test.ts` はdeep clone、map不変、revision、no-op、同一座標重複のlast-write-wins、中央予約metadata欠落を含むatomic rejection、中央・外周guard、current topologyのBFSを検証する。
- `e2e/prototype.spec.ts` はcombat開始後のactive enemyを維持したまま安全な通常wallを選び、DEV開放後のrevision、path、visible observation、実DOM minimap Canvas pixel、Graphics command buffer、wall collider除去、player通過、pickup / ammo box / inventory保持、retry後revision `0`を検証する。
