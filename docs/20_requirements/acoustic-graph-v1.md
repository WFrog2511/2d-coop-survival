---
id: REQ-ACOUSTIC-GRAPH-V1
---

# acoustic-graph-v1 要件

## 目的

Prototype standardのローカル単独プレイヤー版で、成功したplayer行動の論理音をcurrent `RuntimeAreaGraph`に沿って伝播する。通常表示はworld mapとミニマップで同じ到達状態を表示し、音響デバッグ表示は同じcurrent graphと最新の論理音を両方へ可視化する。これは将来の敵知覚の入力候補であり、今回のsliceは敵AI・ヘイト・行動を変えない。

## 関連判断

| 種別 | 参照 |
| --- | --- |
| 音響・区画判断 | [Issue #62](https://github.com/WFrog2511/2d-coop-survival/issues/62) |
| 後続の敵知覚・ヘイト | [Issue #76](https://github.com/WFrog2511/2d-coop-survival/issues/76) |
| 実装task | [Issue #102](https://github.com/WFrog2511/2d-coop-survival/issues/102) |
| 空間入力 | [runtime-area-graph-v1 要件](runtime-area-graph-v1.md) |

## 必須範囲

- 成功した発砲、通常移動、実際に移動できたdash、pickupだけが論理音を発生させる。弾切れ、reload中、fire interval中、inventory open、空E、dash cooldown、terminal、壁密着で移動量が0のdashは発生させない。
- ページ上のnative selectで音響表示を`非表示`、`通常`、`音響デバッグ`から選べる。初期値は`通常`である。`非表示`はworld/minimapの音響描画を行わず、`通常`は採用済みのrender waveだけを描く。`音響デバッグ`は通常tile波の代わりに、生成時`ArenaMap.rooms`、current `RuntimeAreaGraph`の全node/edge、最新の論理音のsource・到達node・predecessor経路を描く。
- 音響到達の正本は、current `RuntimeAreaGraph`の`area`、`junction`、`corridor` nodeとedgeである。tile単位の経路探索を到達判定に使用しない。
- actionごとの`strength`、node種別cost、edge crossing cost、表示時間、残像、色、alpha、実音の音量・音色は`src/acoustic-data.ts`で調整可能にする。edge crossing costは0より大きく、node種別costは0を許容する。論理`strength`とWebAudioの`volume`は別の値とする。
- 到達nodeはstrengthを超えない最小cost経路だけを持ち、同costでは`RuntimeAreaGraph`のnode順で決定的にpredecessorを選ぶ。長いcorridorはnode tile数に応じてより大きいcostを消費する。
- tile展開は描画専用である。source nodeはsource tile、後続nodeはpredecessor nodeとの4近傍境界tileをseedにし、到達nodeの内側だけを展開する。未到達nodeまたはwallへ広げない。
- `通常`ではworld mapとミニマップが同じrender snapshotから同じ時点のviewを描く。通常ミニマップは既観測terrainだけを表示し、未踏地を開示しない。`音響デバッグ`ではworldとミニマップが同じgraph単位debug snapshotを共有し、調査目的で未踏nodeを含む全体形状を意図的に開示する。このdebug表示を通常のミニマップ契約へ流用しない。
- 論理waveは自然expiryまたはretry、new run、terminal、成功terrain mutationまで保持する。通常描画への採用は発生時にだけ決め、後から新しいwaveが既に採用済みのwaveを追い出さない。通常表示の採用上限は描画負荷の境界であり、論理伝播の保存件数やゲームルールではない。graph/revision/node/境界の不整合は部分描画せず安全に表示しない。
- mode切替は論理waveを変更しない。retry/new run後もページ上の選択値を維持するが、ページを再読込した初期値は`通常`とする。native selectへfocusがある間は、そのpointer/keyboard入力をPhaserの射撃、移動、dash、pickup、reload、quick slot、inventory操作へ渡さない。

## 保持する境界

- `RuntimeTopology`と`RuntimeAreaGraph`は既存のterrain正本と派生snapshotのまま維持する。音響pure APIは`RuntimeTopology`、Phaser、HUD、timer、通信、保存を参照しない。
- 実音は既存`ArenaEffects`のWebAudio oscillatorを再利用する。新しいasset、audio engine、event bus、ECSは追加しない。
- 既存のfire、移動、dash、pickupの成功条件、bounded wave lifecycle、visibility mask、ミニマップの既観測契約を変えない。dashは開始時ではなく、開始位置から最初の実変位を確認して一度だけ発生する。

## 対象外

- 敵AI、ヘイト、聴覚判定、集団行動、音量に応じた敵反応。
- portal、入口別のnode内距離、dynamic blocker、差分伝播、複数playerの音源統合。
- 実音の主観的な音量・音色バランスの自動判定。
- map形状の見た目や生成規則の追加調整は[Issue #104](https://github.com/WFrog2511/2d-coop-survival/issues/104)で扱い、この音響sliceでは追加しない。

## 受け入れ条件

1. pure unitで、接続・切断、最小cost、tie決定性、strength不足、corridor長、入力不変、0 edgeを含むrevision/invalid failure、render node subset、source/predecessor seedを確認できる。
2. DEV E2Eで成功射撃後にsource/reached/predecessor/revisionを観測できる。`非表示`、`通常`、`音響デバッグ`の三modeで、通常のworld/minimapは同じderived viewを使い、debugのworld/minimapは同じcurrent graphと最新logical eventを使う。debugには未観測nodeが含まれ、通常ミニマップだけが既観測tileを数える。retryとterrain mutationでは論理waveとdebug eventをclearする。
3. 発砲・移動・dash・pickupの試遊で、actionごとの表示と実音を調整できる。実移動したdashは一度だけwaveを増やし、壁密着dashを含むno-op操作は増やさない。mode controlへfocusした操作ではゲーム操作が発生せず、focusを外したSpace/Shiftのdashは従来どおり使える。
