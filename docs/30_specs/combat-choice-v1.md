---
id: SPEC-COMBAT-CHOICE
requirements: REQ-COMBAT-CHOICE
---

# combat-choice-v1 仕様

## Issue #77の限定supersede

[SPEC-AMMO-MATERIAL-V1](ammo-material-v1.md) は、WeaponId別shared ammo、5武器表、shared nextFireAtとreload、retry時の旧ammo表現だけを supersede する。現行は7 WeaponModel、3マテリアル、WeaponInstanceごとのmagazineとnextFireAtを使う。移動、敵、wall、map、照準、入力、既存bullet/collider/range/hit/effectの規則は維持する。

## 現行map・音響への限定supersede

[SPEC-STANDARD-ARENA-MAP-V2](standard-arena-map-v2.md) は、本書の旧map寸法、通路幅、部屋内ランダム障害物、fallback地形だけを履歴化する。現行の通常/fallback通路は2tile幅、中央予約の外側は2layer annulus、`ArenaMap.obstacles`は空配列である。runtime分類は[SPEC-RUNTIME-AREA-GRAPH-V1](runtime-area-graph-v1.md)、三modeの音響表示とdebugの開示境界は[SPEC-ACOUSTIC-GRAPH-V1](acoustic-graph-v1.md)を参照する。形状の追加調整は[Issue #104](https://github.com/WFrog2511/2d-coop-survival/issues/104)の範囲であり、本書の武器・敵・戦闘stateの履歴仕様は変更しない。

> [Issue #38](https://github.com/WFrog2511/2d-coop-survival/issues/38) follow-upにより、敵HP、ドローン耐性、death再出現delayは本書の初版値から更新された。
>
> [Issue #71](https://github.com/WFrog2511/2d-coop-survival/issues/71)は、本書の旧二武器・第三武器対象外・固定weapon種slotの記述を履歴とする。ハンドガン、リボルバー、コンパクトピストルは`WeaponId`のhandgunとshared ammo stateを使い、`1`〜`3`はクイックスロットを選択する。

## 起動と操作

`pnpm dev`で起動するPCブラウザの800×500px表示領域を使う。WASDまたは矢印キーで毎秒210px移動し、斜め移動は正規化する。マウスで照準する。`1`〜`3`キーは対応するクイックスロットのmodelを選択し、`R`キーはそのmodelが解決する選択中`WeaponId`を手動リロードする。カメラは3200×2000pxのワールド内でプレイヤーを追従する。

## 自動生成アリーナ

- 1タイル40px、80×50タイル（3200×2000px）とし、外周は常にwallにする。
- 32bit seedから通常14部屋を生成する。部屋幅は8〜12タイル、高さは6〜10タイルで、部屋間は最低1タイルのwall余白を保つ。
- 部屋中心を順に、seedで決めた横・縦順と幅1〜3タイルのL字通路で接続する。部屋内には通路と開始地点を塞がない少数の1タイル障害物を置く。
- 全floorが開始地点から4近傍で到達可能か検査する。最大8候補が不成立なら、3列×3行の中央開始8部屋（各12×10タイル）を中央から上下左右へ幅2通路で接続した連結済みfallbackを使う。
- 床には40px間隔のgridを描き、wallは床と区別できる色で描く。プレイヤー、敵、弾はwallを通過せず、弾はwallとの最初の衝突で無効化する。
- HUDにmap seedとプレイヤーのタイル座標を表示する。再挑戦は最大64候補内で直前とタイル配置が異なるmapを選び、seedも更新する。異なるmapを生成できなければ起動失敗として扱う。

## 武器と弾倉

| 武器 | 弾種 | 入力 | 発射待ち | 弾倉 | リロード | 弾道 |
| --- | --- | --- | --- | --- | --- | --- |
| アサルトライフル | 小口径弾 | 左ボタン長押しで自動射撃 | 150ms | 20発 | 1200ms | 1発、基礎ダメージ2、600px/秒、射程520px、拡散0rad、ノックバックなし |
| ショットガン | 散弾 | pointerdownごとに1射 | 750ms | 4発 | 1600ms | 5ペレット、各基礎ダメージ2、420px/秒、射程220px、中心から最大±0.20rad、命中敵を弾の進行方向へ毎秒240pxで0.18秒 |
| ハンドガン／リボルバー／コンパクトピストル | 小口径弾 | pointerdownごとに1射 | 150ms | 10発 | 1200ms | 1発、基礎ダメージ2、600px/秒、射程520px、拡散0rad、ノックバックなし |

各射撃はペレット数に関わらず選択武器の残弾を1だけ消費する。射撃は`now >= nextFireAt`で許可し、直前の時刻では許可しない。射撃待ち時間と残弾は`WeaponId`別に保持するため、切替によってショットガンまたはsidearmの待ち時間を回避できない。予備弾薬は武器別の`reserveInitial`、`reserveMax`、対応`AmmoType`の`boxQuantity`で有限に管理し、sidearmは`HANDGUN_AMMO`の予備設定とhandgun-ammoの10発単位を使う。複数のsidearm modelは、その残弾・予備弾・リロード状態を1組だけ共有する。空弾倉またはリロード中は射撃しない。Tab詳細インベントリを開いている間はpointerdownと自動長押しを同じ射撃入口で拒否し、残弾・予備弾・reload状態を変更しない。空弾倉では、詳細画面が閉じていればHUDに`弾切れ: Rでリロード`を表示する。異なる`WeaponId`への切替はリロードを中断し、残弾を保持する。

弾は敵またはwallとの最初の衝突で無効化する。射程外の弾も無効化してプールから再利用する。命中時は敵を短時間点滅させ、HUDに命中武器と敵個体名を表示する。ドローンを含む全敵の小口径damage multiplierは1であり、耐性表示は行わない。

## 敵個体とAI

| 個体ID | 種別 | HP | 経路移動 | 接触ダメージ | 接触間隔 | 再出現 |
| --- | --- | --- | --- | --- | --- | --- |
| `basic-1` | 基本敵 | 4 | 4近傍BFSの次タイルへ68px/秒 | 8 | 1.5秒 | HP 4、5000〜9000ms後 |
| `basic-2` | 基本敵 | 4 | 4近傍BFSの次タイルへ68px/秒 | 8 | 1.5秒 | HP 4、5000〜9000ms後 |
| `basic-3` | 基本敵 | 4 | 4近傍BFSの次タイルへ68px/秒 | 8 | 1.5秒 | HP 4、5000〜9000ms後 |
| `drone-1` | 高速ドローン | 2 | 4近傍BFS方向へ150px/秒で進み、`sin(time / 95) * 85 + sin(time / 37) * 35px/秒`の直交横速度を加える | 6 | 1.2秒 | HP 2、3000〜6000ms後 |

敵経路は最大250ms間隔、プレイヤータイル変更時、敵タイル変更時のいずれかで再計算する。wall・範囲外を通らず、経路がない敵は次の再計算まで停止する。初期出現と再出現はfloorかつ他個体と重ならない位置から選び、現在のcamera viewport外かつviewportから6タイル以内の候補を優先する。画面外候補がなければ、プレイヤーからManhattan距離が最大のfloorを座標順で選ぶ。位置と待ち時間はmap seed、敵ID、出現回数に対して決定的である。

基本敵とドローンは小口径弾・散弾とも基礎ダメージの100%を受ける。ライフル基礎ダメージ2によりHP2のドローンは1発で撃破できる。各stable個体はHP、撃破状態、再出現timer、接触cooldown、knockback、hit flashを個別管理する。player HPは100で0未満にしない。HUDは敵HPを表示し、ドローン耐性は表示しない。

## 状態遷移とリセット

通常状態では武器選択、移動、照準、射撃、リロード、敵経路移動、命中処理を行う。プレイヤーHPが0になると敗北状態へ移り、物理演算、移動、射撃、敵追跡、被弾を停止し、リロードを中断して画面上の弾を無効化する。

再挑戦は再出現・命中表示・リロードの旧timerを解除し、旧wall body、Graphics、経路cache、弾を破棄する。次に直前と異なるmapを生成し、選択quick slotを初期ライフル、残りquick slotとbackpackを空、弾倉をライフル20発・ショットガン4発・handgun系sidearm共有10発へ戻し、発射待ち、プレイヤーHP、stable 12体の敵個体のHP・位置・速度・active/visible、接触クールダウン、HUDと敗北表示を初期化する。timer callbackはmap世代が異なる状態を書き換えない。

## 代表E2E

Playwright Chromiumでmap seed、player tile、初期ライフル20/20、基本敵HP4、ドローンHP2・耐性なしを確認する。操作説明・HUD・敵HPテキストより上の800×500px canvasが初期化後も位置と寸法を保つこと、移動、ライフル自動射撃、ショットガン750ms制限、sidearm modelのquick slot選択とshared ammo、reload、敗北、retry後のinventory・武器・HP・敵state初期化を確認する。

視界・霧、破壊可能地形、map保存・選択、高度な自動生成、A*、navmesh、ウェーブ、通信同期は対象外とする。
