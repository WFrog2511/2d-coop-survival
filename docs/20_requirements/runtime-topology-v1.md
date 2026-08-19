---
id: REQ-RUNTIME-TOPOLOGY-V1
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/98
---

# runtime-topology-v1 要件

## 成果物段階

Prototype standard のローカル単独プレイヤー版で、生成済み標準アリーナを変えずに、run中の現在terrainだけを安全に更新できる最小の RuntimeTopology を提供する。今回は DEV の wall→floor 確認経路だけを接続し、戦闘バランス、通信、永続化、地形破壊のゲームループは含めない。

## 合意済み要件

- `ArenaMap` はseed、開始位置、部屋・通路・障害物、中央予約metadata、生成時のtile配置を保持するstableな生成結果であり、runtime mutationはこの値を変更しない。
- run開始、retry、new runごとに、`ArenaMap` のtile配列を深く複製した `RuntimeTopology` を作る。初期`revision`は`0`とする。
- runtime mutationはbatchとして扱う。stable `ArenaMap` の`centralReserve`を必須guardとして渡し、metadataが欠ければfail fastでrejectionする。全tileを事前に検証し、座標が整数かつ範囲内で、tile種別が`wall`または`floor`であり、外周と中央予約領域の内部ではない場合だけ反映する。一件でも不正ならpartial applyしない。
- 有効batchの最終状態に実際の変更が一件以上あれば、全変更を一度に反映して`revision`を一つだけ進める。全件no-opなら同じsnapshotと`revision`を維持する。
- runtimeの床判定、BFS、LOS、敵visibility、spawn、world drop、world/tile変換、viewport、描画、wall collider、ミニマップはcurrent `RuntimeTopology` のterrainを参照する。seed、start、中央予約metadataはstable `ArenaMap` を参照する。
- terrainだけを再構築しても、active enemy、pickup / ammo box、inventory、run timer、combat stateをclearまたは再配置しない。pathとvisibilityのcache、観測値、ミニマップは変更後のterrainへ即時更新する。
- DEV限定の確認経路は通常wallをfloorへ開く操作だけを提供する。本番へgeneric mutation APIを公開せず、floor→wallはruntime経路へ接続しない。
- retry / new runは新しく生成したstable mapからrevision `0`のtopologyを作り、旧runのterrain、path、visibilityの状態を残さない。

## 対象外

- floor→wallのruntime統合、wall damage、素材消費、演出、差分renderer、event bus、revision cache、dynamic blocker
- Room / Area / Acoustic Graph、敵AI、Boss、Supply、Cable、map resize、network同期、team共有
- 既存のmap生成、中央予約、seed決定性、weapon / ammo / enemyの調整値、HUD全体の再設計、新規依存

## 受け入れ条件

- `ArenaMap.tiles` と生成metadataはruntime batchの前後で同じままであり、`RuntimeTopology`だけが変更される。
- 有効な複数tile batchは一度だけrevisionを進める。同一座標の重複は最後の値を採用する。不正tile、範囲外、非整数、中央予約metadata欠落、中央予約、外周、混在batchはrejectionされ、topologyとrevisionは不変である。
- wall→floor後、current topologyのBFS、LOS / visibility、ミニマップ、Graphics、static wall collider、world/tile判定が同じterrainを観測する。
- mutation後も既存のpickup、ammo box、inventory、combat中のactive enemy actor / sprite / body / HPを保持する。
- DEV E2Eは中央予約・外周を避けた通常wallを開き、実DOM minimap Canvasの対象pixelとGraphics command bufferが変化し、playerが通過できること、retry後に新map由来のrevision `0`へ戻ることを確認する。
