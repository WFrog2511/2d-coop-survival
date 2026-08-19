# enemy-visibility-v1 詳細設計

## 目的と状態

enemy表示は`normal`、`boundary`、`hidden`の3状態である。floor外のplayer/enemyはhiddenとし、敵の種別やHPを表示状態判定へ混ぜない。normalは直線LOS、boundaryは遮蔽されたenemyの4近傍可視、hiddenはそれ以外である。

## 処理

supercoverはtile中心間でX/Yの格子境界を跨ぐ順にtileを列挙する。corner同時通過では両直交tileを追加してから対角tileへ進むため、corner越しにwallを見通さない。target以外のwallを見つけた時点でLOSはfalseにする。enemyがtileを跨ぐ、またはplayerがtileを跨ぐ時だけSceneが再評価し、reset/spawn/respawnではforceする。

死角maskはSceneが保持する`map.width×map.height`のCanvasTextureとworld-space Image各1個である。CanvasTextureの1 pixelを1 tileとし、NEARESTでmap world sizeへ拡大する。player tileをcacheし、同tileのupdateでは即returnする。cache不一致、create、spawn、respawn、retry、map再生成ではCanvasTextureをclearし、現行mapの全tileを`hasLineOfSight(map, playerTile, tile)`で判定する。falseのtileだけ黒pixelを描き、完了後に1回だけrefreshする。map寸法変更時はCanvasTextureとImageを同期する。Imageの実alphaは0.25とし、target wallは既存LOS endpoint規則で可視である。maskはmap/wall/enemy/silhouetteより前、playerより後ろに置き、enemy移動や毎frameのLOSは行わない。

visibility presentationとしてのhiddenは描画だけを止め、純粋判定からbody、HP、AIを変更しない。Issue #38の独立したrecycle policyはhidden継続8000〜12000msを参照し、最終hitから3000ms、path 10 edge以上、単一lockを満たす場合だけbodyを一時無効化してHP維持re-entryする。normal/boundaryではhidden継続をresetする。boundaryからnormalへのtexture、alpha 1、visible true復帰とhit tintは従来どおりである。

## DOCGEN

現在のDOCGEN transformはPythonコードのみ対応し、TypeScriptの安定したpublic情報を生成できない。この設計にはDOCGEN_TODOや新transformを追加せず、既存`generated-arena-v1`は履歴のため編集しない。

## テスト観点

同tile、水平/垂直/斜線、wall、boundary、hidden、4近傍、corner、floor外、遠距離、normal優先をunitで検査する。固定seed E2Eは表示属性とmaskに加え、Issue #38側でhidden時間を制御するDEV限定hookを使って段階投入とphaseをrecycleから分離する。productionではScene/hookをglobal公開しない。
