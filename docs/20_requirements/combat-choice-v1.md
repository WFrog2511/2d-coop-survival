---
id: REQ-COMBAT-CHOICE
status: agreed
approved_on: 2026-08-02
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/12
---

# combat-choice-v1 要件

## 目的

prototype-v0を拡張し、二つの武器と二種の敵をブラウザ上で選択・識別・撃破できる最小戦闘ループを提供する。

## 必須範囲

- PCブラウザ上の固定アリーナと1人プレイ
- `1`キーでアサルトライフル、`2`キーでショットガンを切り替え、選択中の武器をHUDに表示
- 中距離単発のライフルと、近距離・複数ペレット・拡散・ノックバックを持つショットガン
- 基本敵と、低耐久・高速・別シルエットの高速ドローンを同時に表示
- 敵ごとのHP、撃破、再出現、命中の視認フィードバック
- 被弾、敗北、再挑戦。再挑戦では武器、敵、弾、HP、タイマー、フィードバックを初期化
- 上記経路の純粋ロジック検査とPlaywright代表E2E

## 対象環境

- PC、Google Chrome最新版
- TypeScript、Phaser、Vite、Vitest、Playwright
- 外部サービス、通信、永続化なし

## 顧客確認

- 武器ごとの有利距離・立ち位置は[GitHub Issue #14](https://github.com/WFrog2511/2d-coop-survival/issues/14)で確認する。
- 敵ごとの撃破優先度は[GitHub Issue #15](https://github.com/WFrog2511/2d-coop-survival/issues/15)で確認する。

## 対象外

弾薬、リロード、第三武器、他の敵、回避、ウェーブ、通信、複数人同期、永続化、Edge検証、公開配信は含めない。
