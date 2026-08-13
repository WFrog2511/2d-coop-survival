---
id: REQ-COMBAT-CHOICE
status: agreed
approved_on: 2026-08-02
reapproval: GitHub Issue #12 の 2026-08-02 コメント
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/12
---

# combat-choice-v1 要件

## 目的

prototype-v0を拡張し、初期ライフルとworld pickupで取得するショットガン・sidearm model、9体の基本敵・3体の高速ドローンを、遮蔽物を持つ自動生成アリーナで選択・識別・撃破できる最小戦闘ループを提供する。

## Issue #71の限定supersede

[Issue #71](https://github.com/WFrog2511/2d-coop-survival/issues/71)は、本書の旧「二つの武器」および固定weapon種ごとのslot記述を履歴として扱う。`WeaponId`のhandgunとshared ammo stateは維持しつつ、ハンドガン・リボルバー・コンパクトピストルのmodelを同じhandgunへ解決し、`1`〜`3`で3つのクイックスロットを選択する。既存の戦闘選択・敵・地形の契約は維持する。

## 必須範囲

- PCブラウザ上の800×500px表示領域、40pxタイル・80×50マス（3200×2000px）の広域アリーナと1人プレイ
- 通常14個の矩形部屋（幅8〜12、高さ6〜10マス）、幅1〜3マスのL字通路、外周wall、到達可能floor、少数の1マス障害物をseed付きで自動生成し、最大8候補が不成立なら3列×3行の中央開始8部屋（各12×10マス程度、中央から上下左右へ幅2通路）を使う
- プレイヤー追従camera、床grid、wall衝突、敵の4近傍BFS移動、画面外優先の敵出現
- HUDにmap seedとプレイヤータイル座標を表示し、再挑戦では必ず別seedを使う
- `1`〜`3`キーで対応するクイックスロットの武器modelを選択し、選択中のmodel名・残弾・リロード状態をHUDに表示
- ライフルとハンドガンは小口径弾、ショットガンは散弾として、いずれも基礎ダメージ2を持つ
- ライフルは左ボタン長押しで150msごとに自動射撃し、20発の弾倉を1.2秒でリロードする
- ショットガンは1クリック1射で、750msごとに最大4発を射撃し、5ペレット、拡散、近距離、ノックバックを持ち、1.6秒でリロードする
- `R`キーで選択武器を手動リロードする。予備弾薬は武器別の`reserveInitial`、`reserveMax`と対応`AmmoType`の`boxQuantity`で有限に管理し、handgun系sidearmは`HANDGUN_AMMO`の予備設定とhandgun-ammoの10発単位を使う。sidearm modelを複数取得しても同じ残弾・予備弾・リロード状態を共有する。リロード中は射撃不可、異なる`WeaponId`への切替だけがリロードを中断して残弾を保持し、同じhandgunのsidearm model切替は継続する。Tab詳細インベントリを開いている間はpointerdownと自動射撃を無作用にし、弾薬消費と空弾倉の自動リロードを開始しないが、`R`の手動リロードは維持する
- 空弾倉では射撃せず、HUDで`R`によるリロードを案内する。武器ごとの射撃待ち時間は切替後も保持する
- 9体の基本敵はHP4、3体の高速ドローンはHP2とする。初期8体から段階投入してstable 12体へ到達させ、両弾種は全敵へ100%のdamageとして適用する
- 高速ドローンがライフル1発で撃破可能であることをHUDへ表示し、再現可能な合成横速度で追跡方向に直交するジグザグ接近を行う
- 敵個体ごとのHP、撃破、再出現、接触、ノックバック、命中フィードバックを管理する。基本敵は5000〜9000ms、高速ドローンは3000〜6000msで、seed・敵ID・出現回数に対して決定的に再出現する
- 被弾、敗北、再挑戦。敗北時はリロードを中断し、再挑戦ではクイックスロット、バックパック、武器、弾倉、射撃待ち、リロードタイマー、stable 12体の敵、弾、HP、フィードバックを初期化
- 上記経路の純粋ロジック検査とPlaywright代表E2E

## 対象環境

- PC、Google Chrome最新版
- TypeScript、Phaser、Vite、Vitest、Playwright
- 外部サービス、通信、永続化なし

## 顧客確認

- 武器ごとの有利距離・立ち位置は[GitHub Issue #14](https://github.com/WFrog2511/2d-coop-survival/issues/14)で確認する。
- 高速ドローンによる撃破優先度は[GitHub Issue #15](https://github.com/WFrog2511/2d-coop-survival/issues/15)で確認する。
- 自動生成地形で移動と遮蔽物の判断が成立するかは[GitHub Issue #17](https://github.com/WFrog2511/2d-coop-survival/issues/17)で確認する。

## 対象外

追加敵種、回避、ウェーブ、視界・霧、破壊可能地形、マップ保存・選択、通信、複数人同期、永続化、Edge検証、公開配信は含めない。
