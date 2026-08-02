---
id: REQ-PROTOTYPE-LOOP
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/4
approved_on: 2026-08-02
---

# prototype-v0 要件

## 目的

企画書の段階1全体へ広げる前に、ブラウザ上の最小戦闘ループを一つ完成させる。

## 必須範囲

- 1人プレイ
- 固定アリーナ
- キーボード移動とマウス照準
- 武器1種による射撃
- 基本敵1種
- プレイヤーの被弾と敗北
- 敗北後の再挑戦
- 上記経路を確認する代表E2E

## 対象環境

- PC
- Google Chrome最新版
- TypeScript、Phaser、Vite
- 外部サービス、通信、永続化なし

## 手動確認

- 操作、射撃、被弾、敗北、再挑戦を一続きで実行できる。
- 被弾または敗北の理由をプレイヤーが確認できる。
- Chromeでfpsを実測して記録できる。合否閾値は初回計測後のdecisionで決める。

## 対象外

追加武器・敵、ウェーブ、大型敵、救助、共有視界、Colyseus、複数人同期、永続化、Edge検証、公開配信はこの縦切りの完了条件に含めない。
