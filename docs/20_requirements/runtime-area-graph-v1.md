---
id: REQ-RUNTIME-AREA-GRAPH-V1
---

# runtime-area-graph-v1 要件

## 目的

Prototype standardのローカル単独プレイヤー版で、current `RuntimeTopology`から後続の敵AI・音響・Boss経路が利用できる最小の空間graphを導出する。今回の出力は純粋なruntime snapshotと既存DEV観測だけであり、ゲームプレイ、UI、AI判断は変更しない。

## 必須範囲

- `RuntimeTopology`の`floor` tileだけを分類する。2×2の全tileがfloorであるblockへ参加するtileは`area`、残りのfloorのうち4近傍floor数が3以上なら`junction`、それ以外は`corridor`とする。
- 同じ分類の4近傍連結componentを一つのnodeとし、異なるnodeのfloor tileが4近傍で接する場合だけ無向edgeを作る。
- node ID、node順、tile順、edge順は同一topologyから常に決定的に再現する。graphは元の`RuntimeTopology.revision`を保持し、tileからnode、nodeから隣接nodeをqueryできる。
- `Arena.reset`は新しいrevision 0 topologyの直後にgraphを作り直す。有効なtopology mutationが成功した場合だけ、交換済みtopologyからgraphを作り直す。no-opまたはrejected mutationでは既存graphを保つ。
- DEV E2Eは既存`window.__arenaScene`の観測だけで、wall→floor後のgraph snapshot交換とrevision一致、retry後のrevision 0を確認する。

## 保持する境界

- `ArenaMap.rooms`、`ArenaMap.corridors`、seed、start、中央予約metadataは生成時のstable metadataのままとし、runtime graphで書き換えない。
- graphは`RuntimeTopology`を変更せず、Phaser object、timer、HUD、通信、永続化を持たない。

## 対象外

- 敵AI、ヘイト、集団行動、音響伝播、Boss 7×7通行判定、anchor、Cable、dynamic blocker、差分更新、event bus、プレイヤー向けUI。
- `floor`→`wall`や地形破壊のゲームループ、既存のDEV wall→floor以外のterrain入力。

## 受け入れ条件

1. 2×2 area、細いjunction、corridor component、異node edge、tile/隣接query、決定性、入力不変を対象unitで確認できる。
2. 通常wallをDEVで開くとcurrent topologyとgraphが同じrevisionへ進み、新しいfloor tileがいずれかのnodeへ割り当てられる。既存のterrain描画・collider・minimap・enemy・inventory契約を保持する。
3. retry/new runは新しいcurrent topologyとgraphをrevision 0から作り、前runのgraphを再利用しない。
