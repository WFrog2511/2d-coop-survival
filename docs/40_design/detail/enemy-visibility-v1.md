# enemy-visibility-v1 詳細設計

## 目的と状態

enemy表示は`normal`、`boundary`、`hidden`の3状態である。floor外のplayer/enemyはhiddenとし、敵の種別やHPを表示状態判定へ混ぜない。normalは直線LOS、boundaryは遮蔽されたenemyの4近傍可視、hiddenはそれ以外である。

## 処理

supercoverはtile中心間でX/Yの格子境界を跨ぐ順にtileを列挙する。corner同時通過では両直交tileを追加してから対角tileへ進むため、corner越しにwallを見通さない。target以外のwallを見つけた時点でLOSはfalseにする。enemyがtileを跨ぐ、またはplayerがtileを跨ぐ時だけSceneが再評価し、reset/spawn/respawnではforceする。

死角maskはSceneが保持するworld-space Graphics 1個である。player tileをcacheし、同tileのupdateでは即returnする。cache不一致、create、spawn、respawn、retry、map再生成ではGraphicsをclearし、現行固定arenaの全tileを`hasLineOfSight(map, playerTile, tile)`で判定する。falseのtileだけ黒矩形を描き、Graphicsの実alphaは0.25とする。target wallは既存LOS endpoint規則で可視である。maskはmap/wall/enemy/silhouetteより前、playerより後ろに置き、enemy移動や毎frameのLOSは行わない。

hiddenは描画だけを止める。`disableBody`、`setActive`、path、HP、velocity、damage、timerは使用しない。boundaryからnormalへ戻る時は固有texture、alpha 1、visible trueを必ずセットする。tintは既存hit flash専用である。

## DOCGEN

現在のDOCGEN transformはPythonコードのみ対応し、TypeScriptの安定したpublic情報を生成できない。この設計にはDOCGEN_TODOや新transformを追加せず、既存`generated-arena-v1`は履歴のため編集しない。

## テスト観点

同tile、水平/垂直/斜線、最初wall、wall後、wall直後boundary、2tile奥hidden、4近傍限定、corner、floor外、遠距離、normal優先をunitで検査する。固定seed E2Eは敵の観測属性、mask alpha、暗転tile数、mask player tile、既存戦闘/retry回帰を確認する。観測用data属性はGraphicsの実alphaと再描画時の実計算値からだけ同期し、テスト専用値は置かない。
