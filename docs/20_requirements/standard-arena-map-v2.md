---
id: REQ-STANDARD-ARENA-MAP-V2
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/64
---

# standard-arena-map-v2 要件

## 成果物段階

Prototype standard の試遊優先モードで、ローカルの単独プレイヤーが探索できる標準アリーナと最小ミニマップを提供する。数値や見た目の方向性は試遊で確認し、通信・永続化・汎用マップ基盤は含めない。

## 合意済み要件

- 標準アリーナは奇数の `113×71` tile とする。将来のサイズ変更はこのsliceでは扱わないが、中心と予約領域はマップ寸法から導く。
- 中央には中心を基準にした `13×13` tile の予約領域を置く。通常生成とfallback生成は、部屋、障害物、通路によって予約領域のtileをfloorへ変更しない。予約領域は通常waveの敵が侵入できないwallである。
- 予約領域の外側には上・右・下・左の4方向それぞれに、開始tileから到達できる安定した接近候補をmetadataとして提供する。
- 同じseedでは同じ地形と予約metadataを生成し、retry / new runは既存の決定的な次map選択を維持する。
- camera、physics world bounds、床・壁の描画、viewport計算は、そのrunの `ArenaMap` 寸法とtileSizeを使用する。旧固定サイズを前提にしない。
- 右上には常時の最小ミニマップを表示し、その直下に既存run panelを置く。ミニマップはポインター入力を妨げない。
- ミニマップは現在視認できるtile、最後に視認したwall / floor、player位置、現在視認できるactive enemy・weapon・弾薬・スクラップだけを表示する。視界外の動的marker、境界silhouette、未観測地形は表示しない。
- retry / new runでは観測済み地形と現在視界を初期化する。最後に見た地形は視認した時点のtile値を保持し、非可視中の現在地形を再読込しない。

## 対象外

- RuntimeTopology、room graph、loop生成、Acoustic Graph、地形破壊・変化、boss、map resize query
- チーム共有、drone視界、down状態、network同期、tactical map、ping、正式UI
- ミニマップのスクリーンショット比較、汎用ミニマップframework、新規依存、HUD全体の再設計

## 受け入れ条件

- 標準生成とfallback生成は、設定から導かれる奇数寸法、中央予約領域、4接近候補、外周wall、開始地点からのfloor到達可能性を満たす。
- 予約領域の全tileはwallで、4接近候補はfloorかつ開始地点からBFSで到達可能である。
- run開始後、カメラと物理境界が生成mapのworld寸法と一致し、プレイヤーは境界と中央予約領域を識別できる。
- ミニマップは探索に応じて既知地形を増やし、markerは可視中だけ表示する。retry後は前runの探索記録・markerを残さない。
- `Tab`、移動、射撃、retryなど既存の入力経路はミニマップ表示によって妨げられない。
