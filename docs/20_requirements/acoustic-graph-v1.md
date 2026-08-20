---
id: REQ-ACOUSTIC-GRAPH-V1
---

# acoustic-graph-v1 要件

## 目的

Prototype standardのローカル単独プレイヤー版で、成功したplayer行動の論理音をcurrent `RuntimeAreaGraph`に沿って伝播し、world mapとミニマップで同じ到達状態を表示する。これは将来の敵知覚の入力候補であり、今回のsliceは敵AI・ヘイト・行動を変えない。

## 関連判断

| 種別 | 参照 |
| --- | --- |
| 音響・区画判断 | [Issue #62](https://github.com/WFrog2511/2d-coop-survival/issues/62) |
| 後続の敵知覚・ヘイト | [Issue #76](https://github.com/WFrog2511/2d-coop-survival/issues/76) |
| 実装task | [Issue #102](https://github.com/WFrog2511/2d-coop-survival/issues/102) |
| 空間入力 | [runtime-area-graph-v1 要件](runtime-area-graph-v1.md) |

## 必須範囲

- 成功した発砲、通常移動、実際に移動できたdash、pickupだけが論理音を発生させる。弾切れ、reload中、fire interval中、inventory open、空E、dash cooldown、terminal、壁密着で移動量が0のdashは発生させない。
- 音響到達の正本は、current `RuntimeAreaGraph`の`area`、`junction`、`corridor` nodeとedgeである。tile単位の経路探索を到達判定に使用しない。
- actionごとの`strength`、node種別cost、edge crossing cost、表示時間、残像、色、alpha、実音の音量・音色は`src/acoustic-data.ts`で調整可能にする。edge crossing costは0より大きく、node種別costは0を許容する。論理`strength`とWebAudioの`volume`は別の値とする。
- 到達nodeはstrengthを超えない最小cost経路だけを持ち、同costでは`RuntimeAreaGraph`のnode順で決定的にpredecessorを選ぶ。長いcorridorはnode tile数に応じてより大きいcostを消費する。
- tile展開は描画専用である。source nodeはsource tile、後続nodeはpredecessor nodeとの4近傍境界tileをseedにし、到達nodeの内側だけを展開する。未到達nodeまたはwallへ広げない。
- world mapとミニマップは同じrender snapshotから同じ時点のviewを描く。ミニマップは既観測terrainだけを表示し、未踏地を開示しない。
- active waveは上限を持ち、retry、new run、terminal、成功terrain mutationでclearする。graph/revision/node/境界の不整合は部分描画せず安全に表示しない。

## 保持する境界

- `RuntimeTopology`と`RuntimeAreaGraph`は既存のterrain正本と派生snapshotのまま維持する。音響pure APIは`RuntimeTopology`、Phaser、HUD、timer、通信、保存を参照しない。
- 実音は既存`ArenaEffects`のWebAudio oscillatorを再利用する。新しいasset、audio engine、event bus、ECSは追加しない。
- 既存のfire、移動、dash、pickupの成功条件、bounded wave lifecycle、visibility mask、ミニマップの既観測契約を変えない。dashは開始時ではなく、開始位置から最初の実変位を確認して一度だけ発生する。

## 対象外

- 敵AI、ヘイト、聴覚判定、集団行動、音量に応じた敵反応。
- portal、入口別のnode内距離、dynamic blocker、差分伝播、複数playerの音源統合。
- 実音の主観的な音量・音色バランスの自動判定。

## 受け入れ条件

1. pure unitで、接続・切断、最小cost、tie決定性、strength不足、corridor長、入力不変、0 edgeを含むrevision/invalid failure、render node subset、source/predecessor seedを確認できる。
2. DEV E2Eで成功射撃後にsource/reached/predecessor/revisionを観測でき、world/minimapが同じderived viewを使い、ミニマップが既観測tileだけを数え、retryでclearする。
3. 発砲・移動・dash・pickupの試遊で、actionごとの表示と実音を調整できる。実移動したdashは一度だけwaveを増やし、壁密着dashを含むno-op操作は増やさない。
