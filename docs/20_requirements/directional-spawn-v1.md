---
id: REQ-DIRECTIONAL-SPAWN
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/22#issuecomment-5222574276
implementation_task: https://github.com/WFrog2511/2d-coop-survival/issues/22
---

# directional-spawn-v1 要件

## 目的

敵の出現方向を60秒ごとに切り替え、主方向と反対方向から圧力をかけることで、既存の戦闘・索敵・弾薬管理・3分間生存ループを維持したまま、playerに位置取りの判断を生むローカル1人用プロトタイプを提供する。

## 必須範囲

- run開始時をphase 0とし、経過時間60000msごとにphaseを1増やす。phase表示は利用者向けに1始まりとする。
- 出現方向はplayerのspawn時点のtileを基準とする上・右・下・左の4方向とする。
- 各phaseの主方向はmap seedと0始まりのphaseから決定的に決め、同じmap seedとphaseでは同じ主方向になるようにする。
- 12個のstable slotを、各4 slotにつき主方向3、反対方向1の比率で割り当てる。全体では主方向9体、反対方向3体とし、左右など他の2方向へは割り当てない。
- activeな敵は基本敵9体、高速ドローン3体の計12体とし、stable IDをrun中維持する。
- phase境界ではactiveな敵を移動または再配置しない。境界後に新しく行うspawnまたはrespawnだけが、その時点のphase、主方向、stable slotの割り当て方向を使用する。
- spawn候補は現在のcamera viewport外にある、playerから到達可能なfloor tileとする。player、activeな弾薬箱、他のactiveな敵と重複させない。
- 指定方向のviewport外候補がない場合は、方向を問わないviewport外候補へfallbackする。viewport外候補自体がない場合は、重複を除いた到達可能floorのうちplayerから最遠のtileへfallbackする。候補が一つもない場合は敵を生成せず、失敗をHUDへ示す。
- retryでは旧runのtimerと敵を破棄し、新しいrunの開始時刻、map、敵12体、phaseを初期化する。retry直後はphase 0として新しいmap seedから主方向を決める。
- 診断HUDに出現phaseと主方向を表示し、それぞれ`data-phase`と`data-direction`を同期する。
- 敵ごとのHP outputに`data-stable-id`、`data-spawn-phase`、`data-primary-direction`、`data-assigned-direction`、`data-spawn-tile`を同期し、既存visibility用data属性を維持する。

## 既存sliceとの境界

- Issue #20で成立したenemy visibility、通常表示・boundary silhouette・hidden、暗転mask、更新契約を維持する。敵数と出現位置の変更をvisibility判定の変更へ広げない。
- Issue #21の有限弾薬、武器切替、射撃、リロード、ammo panel、弾薬箱4個の契約を維持する。spawn tileはactiveな弾薬箱と重複させない。
- Issue #34の180000ms生存勝利、victory/defeat時の停止、retry初期化、取得済み弾薬箱の30000ms後respawnを維持する。敵のphaseは同じrun開始時刻を基準とし、terminal後に新しい敵をspawnまたはrespawnしない。弾薬箱respawn側もactiveな敵との非重複を維持する。

## 受け入れ条件

1. run開始から59999msまではphase 0であり、60000msの境界でphase 1へ進む。以後も60000msごとにphaseが進む。
2. 同じmap seedとphaseから同じ主方向が得られ、連続する4 phaseで上・右・下・左の4方向が一度ずつ主方向になる。
3. 12個のstable slotは、どの主方向でも主方向9 slot、反対方向3 slotとなり、基本敵9体と高速ドローン3体が重複しないstable IDを持つ。
4. 初期spawnと各respawnはspawn時点のplayer tileを基準に、割り当て方向のviewport外かつ到達可能なfloor tileを優先し、player、activeな弾薬箱、他のactiveな敵と重複しない。
5. 指定方向の候補不足時は方向を問わないviewport外候補、viewport外候補不足時は最遠の到達可能floorへfallbackし、候補がない場合は重複生成せず失敗を表示する。
6. phase境界を越えてもactiveな敵12体のstable ID、位置、spawn時のphase・主方向・割り当て方向は変わらず、その後にrespawnした敵だけが新phaseの値と位置を持つ。
7. retry後はphase 0、敵12体、新しいmap seedに対応する主方向へ戻り、旧runのspawnまたはrespawn callbackが新runへ副作用を与えない。
8. HUDのphase、主方向および敵12体のspawn metadataをdata属性から観測でき、既存のvisibility、有限弾薬、3分勝利、弾薬箱respawn、defeat、retryの代表経路が回帰しない。

## 対象外

wave director、敵数の動的増減、phaseごとの敵種・HP・速度・damage・respawn delayのbalance変更、主方向以外の複雑な比率、汎用spawn strategyまたは設定基盤、multiplayer sync、persistence、外部asset、新規依存、公開配信は対象外とする。Prototype standardのため、feature個別のmatrix、release-readiness、delivery evidence、新しいDOCGEN transformは作成しない。

## 検証と顧客確認

- unitで60000ms直前・境界・複数phase、map seedとphaseによる4方向の決定性、stable 12 slotの主9・反3、方向付きspawn、到達可能性、非重複、fallbackを検証する。
- Playwright Chromiumで初期12体のstable IDとspawn metadata、phase境界でactiveな敵を再配置しないこと、新phaseでのrespawn、retryのphase 0初期化、HUD/data属性を検証する。
- Playwright ChromiumでIssue #20のvisibility、Issue #21の有限弾薬、Issue #34の3分勝利と弾薬箱respawnを含む代表利用経路の回帰を検証する。
- 技術検証のPASSは顧客またはプロジェクトオーナーの承認を意味しない。出現方向の圧力が位置取りの判断を生むかは、Issue #22の実装記録とは別の`type:customer-review` Issueで確認し、回答を記録する。

## Ponytail上限と再検討条件

このsliceの上限は、固定12 slot、60秒phase、map seedによる4方向の決定、主3・反1の直接規則、既存spawn選択への方向指定追加までとする。汎用wave/spawn設定、strategy abstraction、追加依存、将来用の可変比率は導入しない。

敵種・方向比率・phase規則を複数の承認済みsliceから個別設定する必要が生じた場合、固定12体を超える負荷で計測済みの性能問題が出た場合、またはmultiplayer同期でserver authorityが必要になった場合に限り、汎用化、cache、設定化、同期境界を別Issueで再検討する。
