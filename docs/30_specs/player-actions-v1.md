---
id: SPEC-PLAYER-ACTIONS
requirements: REQ-PLAYER-ACTIONS
---

# player-actions-v1 仕様

## 開始ゲートと役職表示

- `PLAYER_ROLES`は5役職のID、表示名、色名、CSS表示用`accent`、Phaser描画用の数値`tint`を保持する。選択前の開始ボタンは無効で、選択した役職だけが開始できる。
- 通常ページでは開始操作まで`Phaser.Game`を生成しない。DEVの`?start=dev`だけは既存E2E用にガンナーを選択して開始する明示経路とする。
- `startArena`は選択済み役職を`Arena` Scene instanceへ明示的に渡す。プレイヤーのbase textureはbody `#c8c8c8`、core `#ffffff`の明るいグレースケールとし、生成時に選択済み役職の`PlayerRole.tint`を適用する。`basic`、`drone`、`enemy-silhouette` textureはグレースケールとする。`ArenaEffects`は選択済み`PlayerRole.tint`を使って敵への着弾effectを描画し、敵種別ごとのshape、duration、scaleは`ENEMY_HIT_EFFECT`で維持する。
- 選択済み役職はHUDの`data-testid="role"`へ表示し、`data-role`へIDを設定する。能力、補正、装備は変更しない。

## 回避

- pointermoveとpointerdownは純粋な`dashDirectionFor`でポインタからプレイヤーへ向く照準ベクトルを正規化して保持する。更新時以外はplayerのrotationを変えず、`aimPoint`は保持方向または現在rotationから`TILE_SIZE`先を算出する。SpaceとShiftは同じ回避開始処理を呼び、回避と自動射撃はこの`aimPoint`を使う。pointerdownは照準を更新してから単発射撃を開始する。`canDashAt`と`dashCooldownUntil`で役職別の再使用待ちを判定する。
- `PLAYER_DASH_DISTANCE_PX`、`PLAYER_DASH_DURATION_MS`、`PLAYER_DASH_COOLDOWN_MS`、`GUNSLINGER_DASH_COOLDOWN_MS`は80px、160ms、667ms、400msを定義する。`dashDistanceFor`と`dashSpeedFor`はガンスリンガーだけ120px・750px/s、ほかの役職は80px・500px/sを返す。`dashCooldownUntil(now, roleId)`はガンスリンガーに400ms、ほかの役職に667msを適用する。`canFireWhileDashing`はガンスリンガーだけ`true`であり、`tryFire`は非ガンスリンガーの回避中に無副作用で終了する。
- 回避中は移動入力より回避速度を優先し、対象方向の壁へ衝突した時点または160ms経過時点で停止する。回避中だけ`hitPlayer`は無副作用で終了する。
- terminalとretryは回避状態と速度を解除する。retryはcooldownも初期化する。装甲敵の固有判定は実装しない。

## pickup選択と弾薬箱

- `selectNearbyPickup(player, anchor, candidates)`はプレイヤータイルとの差分がx/yともに1以下の3x3近傍だけを候補にする純粋関数である。`anchor`はtile空間の小数座標で表したmuzzle位置とし、複数候補はanchor距離、プレイヤータイル距離、y、x、ID順で決定的に1件選ぶ。
- `main.ts`は照準方向のmuzzle anchorとactiveな既存弾薬箱をこの関数へ渡す。物理overlapは取得を起動しない。候補がある間は`data-testid="pickup-prompt"`へ`E: 拾う`を表示し、`E`で選択された1箱だけへ既存`collectAmmoBox`状態遷移を適用する。
- 弾薬箱以外のpickup状態は作らない。既存の`boxId`、30秒respawn、terminal/retryのtimer解除はそのまま使う。

## 検証対象

- `tests/pickups.test.ts`: 3x3境界、muzzle anchorの方向優先、同距離の決定性、候補なし。
- `tests/player-data.test.ts`: 回避方向の正規化、照準なし、任意deadlineのcooldown境界、役職別のdash中発砲可否、コンボと速度buffの状態遷移。
- `e2e/prototype.spec.ts`: 役職選択後の開始、player tintと敵着弾effect色の一致、生成textureのグレースケール、マウス未移動中のrotation維持とpointermove後の更新、DEV明示開始経路、ガンスリンガー選択時のcombo panel可視と値更新、非ガンスリンガーのdash中無発砲、ガンスリンガーのdash中発砲、接触だけでは弾薬箱が消えず、E案内とE取得で消費されること。
- 距離、速度、cooldown、弾薬量、役職色の調整値そのものは自動assertせず手動確認する。
