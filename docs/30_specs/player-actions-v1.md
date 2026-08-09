---
id: SPEC-PLAYER-ACTIONS
requirements: REQ-PLAYER-ACTIONS
---

# player-actions-v1 仕様

## 開始ゲートと役職表示

- `PLAYER_ROLES`は5役職のID、表示名、色名を保持する。選択前の開始ボタンは無効で、選択した役職だけが開始できる。
- 通常ページでは開始操作まで`Phaser.Game`を生成しない。DEVの`?start=dev`だけは既存E2E用にガンナーを選択して開始する明示経路とする。
- 選択済み役職はHUDの`data-testid="role"`へ表示し、`data-role`へIDを設定する。能力、補正、装備は変更しない。

## 回避

- SpaceとShiftは同じ回避開始処理を呼ぶ。純粋な`dashDirectionFor`でポインタからプレイヤーへ向く照準ベクトルを正規化し、`canDashAt`と`dashCooldownUntil`で2000msの再使用待ちを判定する。`PLAYER_DASH_DISTANCE_PX`、`PLAYER_DASH_DURATION_MS`、`PLAYER_DASH_COOLDOWN_MS`は80px、160ms、2000msを定義する。
- 回避中は移動入力より回避速度を優先し、対象方向の壁へ衝突した時点または160ms経過時点で停止する。回避中だけ`hitPlayer`は無副作用で終了する。
- terminalとretryは回避状態と速度を解除する。retryはcooldownも初期化する。装甲敵の固有判定は実装しない。

## pickup選択と弾薬箱

- `selectNearbyPickup(player, anchor, candidates)`はプレイヤータイルとの差分がx/yともに1以下の3x3近傍だけを候補にする純粋関数である。`anchor`はtile空間の小数座標で表したmuzzle位置とし、複数候補はanchor距離、プレイヤータイル距離、y、x、ID順で決定的に1件選ぶ。
- `main.ts`は照準方向のmuzzle anchorとactiveな既存弾薬箱をこの関数へ渡す。物理overlapは取得を起動しない。候補がある間は`data-testid="pickup-prompt"`へ`E: 拾う`を表示し、`E`で選択された1箱だけへ既存`collectAmmoBox`状態遷移を適用する。
- 弾薬箱以外のpickup状態は作らない。既存の`boxId`、30秒respawn、terminal/retryのtimer解除はそのまま使う。

## 検証対象

- `tests/pickups.test.ts`: 3x3境界、muzzle anchorの方向優先、同距離の決定性、候補なし。
- `tests/player-data.test.ts`: 回避方向の正規化、照準なし、cooldown境界。
- `e2e/prototype.spec.ts`: 役職選択後の開始、DEV明示開始経路、Space/Shift回避中の無敵・壁停止・cooldown、接触だけでは弾薬箱が消えず、E案内とE取得で消費されること。
