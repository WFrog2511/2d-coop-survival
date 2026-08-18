---
id: SPEC-ENEMY-VISIBILITY
requirements: REQ-ENEMY-VISIBILITY
---

# enemy-visibility-v1 仕様

`enemyVisibility(map, player, enemy)`は`normal`、`boundary`、`hidden`を返す。playerまたはenemyがmap内floorでなければhiddenである。tile中心を結ぶsupercover LOSはcornerで接する両側tileも検査し、target以外のwallで遮断する。target wallは可視とする。enemy floorへ直接LOSがあればnormal、なければ上下左右4近傍（斜め除外）のいずれかへLOSがあればboundary、その他はhiddenである。

`main.ts`はnormalを固有texture/`visible=true`/`alpha=1`、boundaryを共通36×36 Canvas silhouette/`visible=true`/`alpha=0.30`、hiddenを`visible=false`として適用する。判定はtile変更とspawn、respawn、retry直後だけ更新する。`data-testid`付き敵HP outputの`data-visibility`はE2E観測用であり、HUD情報秘匿ではない。

[Issue #38](https://github.com/WFrog2511/2d-coop-survival/issues/38)のrecycle policyはこの純粋判定と表示契約を変更せず、active enemyがhiddenだった継続時間を別stateで追跡する。normalまたはboundaryで継続時間をresetし、承認済みの距離・被弾・単一lock条件を満たした場合だけHP維持recycleへ渡す。

`main.ts`は`map.width×map.height`のCanvasTextureと、それをNEARESTでmap world sizeへ拡大するworld-space Imageを各1個だけ保持する。CanvasTextureの1 pixelは1 tileで、player floor tileから現行mapの各tileへ`hasLineOfSight`を判定し、falseのtileだけを黒く描く。trueのtileは透明のままとし、wall targetはLOS endpointとして描かない。Imageの`alpha=0.25`、depthはmap/wall/enemy/silhouetteより前、playerより後ろである。

maskはplayer tile cacheと比較し、同tileの`update`では即returnする。create、spawn、respawn、retry、map再生成ではcacheを破棄してforceし、CanvasTextureをclearして描画後に1回だけrefreshする。map寸法変更時はCanvasTextureとImageの表示寸法を現行mapへ同期する。敵移動でmask LOSを再計算しない。player tile outputの`data-visibility-mask-alpha`、`data-obscured-tile-count`、`data-visibility-player-tile`はImageの実alphaと再描画時の実計算値から同期する。

## 代表E2E

`Date.now`を`addInitScript`で固定し、初期mask alpha 0.25、暗転tile数、player tile移動後のmask player tile更新、retry後のmask実値とenemyのnormal/boundary/hidden、既存の射撃、リロード、敗北、retry、pageerrorなしを確認する。pixel比較はしない。
