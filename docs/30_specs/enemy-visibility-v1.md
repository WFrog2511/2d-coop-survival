---
id: SPEC-ENEMY-VISIBILITY
requirements: REQ-ENEMY-VISIBILITY
---

# enemy-visibility-v1 仕様

`enemyVisibility(map, player, enemy)`は`normal`、`boundary`、`hidden`を返す。playerまたはenemyがmap内floorでなければhiddenである。tile中心を結ぶsupercover LOSはcornerで接する両側tileも検査し、target以外のwallで遮断する。target wallは可視とする。enemy floorへ直接LOSがあればnormal、なければ上下左右4近傍（斜め除外）のいずれかへLOSがあればboundary、その他はhiddenである。

`main.ts`はnormalを固有texture/`visible=true`/`alpha=1`、boundaryを共通36×36 Canvas silhouette/`visible=true`/`alpha=0.30`、hiddenを`visible=false`として適用する。判定はtile変更とspawn、respawn、retry直後だけ更新する。`data-testid`付き敵HP outputの`data-visibility`はE2E観測用であり、HUD情報秘匿ではない。

`main.ts`はworld-spaceのGraphicsを1個だけ保持する。mask Graphicsは黒をfillし、Graphics自体の`alpha=0.25`とする。player floor tileから現行mapの各tileへ`hasLineOfSight`を判定し、falseのtileへ`TILE_SIZE`の矩形を描く。trueのtileは描かず、wall targetはLOS endpointとして描かない。depthはmap/wall/enemy/silhouetteより前、playerより後ろである。

maskはplayer tile cacheと比較し、同tileの`update`では即returnする。create、spawn、respawn、retry、map再生成ではcacheを破棄してforceする。敵移動でmask LOSを再計算しない。player tile outputの`data-visibility-mask-alpha`、`data-obscured-tile-count`、`data-visibility-player-tile`はGraphicsの実alphaと再描画時の実計算値から同期する。

## 代表E2E

`Date.now`を`addInitScript`で固定し、初期mask alpha 0.25、暗転tile数、player tile移動後のmask player tile更新、retry後のmask実値とenemyのnormal/boundary/hidden、既存の射撃、リロード、敗北、retry、pageerrorなしを確認する。pixel比較はしない。
