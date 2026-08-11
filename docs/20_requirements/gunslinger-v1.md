---
id: REQ-GUNSLINGER
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/68
---

# gunslinger-v1 要件

## 成果物段階

[Issue #68](https://github.com/WFrog2511/2d-coop-survival/issues/68) の Prototype standard ローカル検証用プロトタイプとする。ガンスリンガーの状態はブラウザ内だけで扱い、永続化・通信同期は追加しない。

## 合意済み要件

- 役職IDが `gunslinger` のときだけ、回避中に敵と overlap した場合は既存の接触ダメージを受けず、ブーツナイフでその敵へダメージを与える。同一回避では stable enemy ID ごとに一度だけ処理する。
- 敵撃破は通常射撃・ブーツナイフを問わず既存の撃破／再出現経路に集約し、ガンスリンガーでは撃破ごとにコンボを1加算する。ブーツナイフで敵を通過できた場合もコンボを1加算し、通常移動速度だけを一時的に強化する。ブーツナイフで撃破した場合は、撃破と通過の両イベントをそれぞれ数える。
- 初期値および terminal・retry 後は、コンボ、速度buff期限、同一回避の処理済みIDを初期化する。既存の回避距離・速度・無敵・cooldownは維持し、速度buffは回避速度へは適用しない。
- ガンスリンガー選択時は HUD の `data-testid="gunslinger-combo"` でコンボと現在の速度倍率を観測できる。ほかの役職の能力・表示色・固定装備は変更しない。

## 仮調整値

以下は [Issue #68](https://github.com/WFrog2511/2d-coop-survival/issues/68) の調整用定数へ隔離する仮値であり、バランス確認後に後続Issueで見直す。

- ブーツナイフダメージ: 2
- 撃破／通過ごとのコンボ加算: 1
- 通過成功時の通常移動速度倍率: 1.2
- 速度buff継続時間: 3000ms

## 対象外

跳弾、集中モード、素材・設備、新敵、マルチ同期、汎用ability framework、役職名・色の全面変更、恒久的なバランス調整は対象外とする。

## 検証

- `tests/player-data.test.ts` で仮調整値、コンボ加算、速度buffの開始・期限境界を確認する。
- `e2e/prototype.spec.ts` でガンスリンガー選択、通常撃破の共通コンボ経路、回避中の一回限りのブーツナイフ、コンボと速度buff HUD を確認する。
- 文書変更後は Markdown link 検査を実行する。
