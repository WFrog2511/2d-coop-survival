---
id: REQ-DIRECTIONAL-SPAWN
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/22#issuecomment-5222574276
implementation_task: https://github.com/WFrog2511/2d-coop-survival/issues/22
follow_up_task: https://github.com/WFrog2511/2d-coop-survival/issues/38
---

# directional-spawn-v1 要件

## 目的

敵の出現方向を60秒ごとに切り替え、主方向と反対方向から圧力をかけることで、既存の戦闘・索敵・弾薬管理・3分間生存ループを維持したまま、playerに位置取りの判断を生むローカル1人用プロトタイプを提供する。

## 必須範囲

- run開始時をphase 0とし、経過時間60000msごとにphaseを1増やす。phase表示は利用者向けに1始まりとする。
- 出現方向はplayerのspawn時点のtileを基準とする上・右・下・左の4方向とする。
- 各phaseの主方向はmap seedと0始まりのphaseから決定的に決め、同じmap seedとphaseでは同じ主方向になるようにする。
- 12個のstable slotを、各4 slotにつき主方向3、反対方向1の比率で割り当てる。全体では主方向9体、反対方向3体とし、左右など他の2方向へは割り当てない。
- Issue #38 follow-upではrun開始時に`basic-1`〜`basic-6`と`drone-1`〜`drone-2`の8体を初期対象とし、`basic-7`、`basic-8`、`basic-9`、`drone-3`を3000/6000/9000/12000msで段階投入してstable 12体へ到達させる。
- phase境界ではactiveな敵を移動または再配置しない。境界後に新しく行うspawnまたはrespawnだけが、その時点のphase、主方向、stable slotの割り当て方向を使用する。
- enemy spawn候補は割り当て方向、camera viewport外、`enemyVisibility=hidden`、playerから到達可能、未占有をすべて満たすfloorだけとする。方向変更または可視位置へのfallbackは行わず、候補なしはinactive/hiddenのまま同じ理由で1000ms後に再試行する。
- 撃破後は基本敵5000〜9000ms、ドローン3000〜6000msの決定的delay後にstrict spawnを試し、成功時だけHPを最大値へ戻す。通常敵HPは4、ドローンHPは2とし、ドローンの小口径耐性を廃止してライフル1発で撃破可能とする。
- active enemyがhiddenを8000〜12000ms継続し、直近3000msに被弾せず、playerまでの最短経路が10 edge以上で、他のrecycleがpendingでない場合、HPを維持してinactiveにし、2000〜4000ms後にstrict spawnする。recycleは同時に1体だけとする。
- 基本敵はID固定で1〜3をdirect、4〜6をleft flank、7〜9をright flankとし、stable IDごとの決定的BFS tie-breakと約1 tile内の局所分離を使う。ドローンは既存の高速な直接追跡と横移動を維持する。
- retryでは旧runの全enemy spawn/retry/death/recycle TimerEventと敵を破棄し、新しいrunの開始時刻、map、初期8体、段階投入、phaseを初期化する。
- 診断HUDに出現phaseと主方向を表示し、それぞれ`data-phase`と`data-direction`を同期する。
- 残り時間をCanvas上部中央、数値とprogressのplayer HPを左下、ammo panelを右下へ置く。敵HP outputには既存spawn属性に加えて`data-active`、`data-spawn-reason`、`data-recycle-count`を同期する。

## 既存sliceとの境界

- Issue #20のLOS計算、normal/boundary/hidden表示、silhouette、暗転maskは維持する。Issue #38のrecycle policyは表示判定結果のhiddenだけを入力として参照し、visibility関数自体へHPやAIを混ぜない。
- Issue #21の有限弾薬、武器切替、射撃、リロード、ammo panel、弾薬箱4個の契約を維持する。spawn tileはactiveな弾薬箱と重複させない。
- Issue #34の180000ms生存勝利、victory/defeat時の停止、retry初期化、取得済み弾薬箱の30000ms後respawnを維持する。敵のphaseは同じrun開始時刻を基準とし、terminal後に新しい敵をspawnまたはrespawnしない。弾薬箱respawn側もactiveな敵との非重複を維持する。

## 受け入れ条件

1. run開始から59999msまではphase 0であり、60000msの境界でphase 1へ進む。以後も60000msごとにphaseが進む。
2. 同じmap seedとphaseから同じ主方向が得られ、連続する4 phaseで上・右・下・左の4方向が一度ずつ主方向になる。
3. 12個のstable slotは、どの主方向でも主方向9 slot、反対方向3 slotとなり、基本敵9体と高速ドローン3体が重複しないstable IDを持つ。
4. 初期8体と段階投入4体は、実camera viewport外、hidden、割り当て方向、到達可能、未占有を同時に満たす位置だけでactiveとなる。
5. strict候補なしでは1000ms retryとなり、deathだけが成功後に全HP、recycleは現在HPを維持する。
6. phase境界で既存active enemyを再配置せず、その後のspawnだけがcurrent phaseを使う。hidden recycleは承認済み条件を満たす1体だけを循環させる。
7. retry後はphase 0、初期8体と段階投入予約、新map seedの主方向へ戻り、旧generationの全TimerEventが副作用を与えない。
8. 通常敵HP4、ドローンHP2・小口径耐性なし、3系統の基本敵経路、Canvas上の時間/HP/ammo overlayを観測でき、Issue #20/#21/#34/#22の代表経路が回帰しない。

## 対象外

wave director、stable 12体を超える動的増加、phase連動balance、汎用spawn strategyまたは設定基盤、multiplayer sync、persistence、外部asset、新規依存、公開配信は対象外とする。Prototype standardのため、feature個別のmatrix、release-readiness、delivery evidence、新しいDOCGEN transformは作成しない。

## 検証と顧客確認

- unitで60000ms直前・境界・複数phase、map seedとphaseによる4方向の決定性、stable 12 slotの主9・反3、方向付きspawn、到達可能性、非重複、fallbackを検証する。
- Playwright Chromiumで初期8体と3000/6000/9000/12000msの段階投入、strict hidden spawn、phase境界、current phase respawn、retry、時間/HP/ammo overlayとdata属性を検証する。
- Playwright ChromiumでIssue #20のvisibility、Issue #21の有限弾薬、Issue #34の3分勝利と弾薬箱respawnを含む代表利用経路の回帰を検証する。
- 技術検証のPASSは顧客またはプロジェクトオーナーの承認を意味しない。出現方向の圧力が位置取りの判断を生むかは、Issue #22の実装記録とは別の`type:customer-review` Issueで確認し、回答を記録する。

## Ponytail上限と再検討条件

このsliceの上限は、固定12 slot、60秒phase、map seedによる4方向の決定、主3・反1の直接規則、既存spawn選択への方向指定追加までとする。汎用wave/spawn設定、strategy abstraction、追加依存、将来用の可変比率は導入しない。

敵種・方向比率・phase規則を複数の承認済みsliceから個別設定する必要が生じた場合、固定12体を超える負荷で計測済みの性能問題が出た場合、またはmultiplayer同期でserver authorityが必要になった場合に限り、汎用化、cache、設定化、同期境界を別Issueで再検討する。
