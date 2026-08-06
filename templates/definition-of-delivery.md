# Definition of Delivery

> task / decision Issueへ貼り付け、人間確認後に開始する。未確定な選択肢、複数taskへ効く条件、独立した承認履歴が必要な場合は`decision:` Issueを使う。範囲が明確なPrototype standardは、人間確認済みのtask Issue本文を正本にできる。

## 開発ハーネスprofile

一つだけ選ぶ。

- [ ] Publish-only
- [ ] Prototype standard
- [ ] Delivery-strict

## 成果物の段階

- [ ] プロトタイプ
- [ ] ローカル検証版
- [ ] 本番運用可能

## 目的と必須範囲

- 目的:
- 必須:
- 明確な対象外:

## 実行環境と依存

- OS / 言語 / ランタイム:
- DB / 外部サービス:
- 権限・ネットワーク制約:

## 検証と人間確認

- 最終tree gate:
- 追加gateと適用条件:
- 手動確認:
- customer-review / 人間承認:

## 証跡とリリース時の扱い

- PR / tag / リリースノート:
- matrix / readiness / evidence（Delivery-strict以外は原則不要）:
- rollback:

## 重要領域と必須ケース

全体coverageだけで完了を判断せず、認証・認可、PII、永続化、migration、状態遷移、外部副作用など、該当する重要領域ごとに必須ケースを決める。

| 重要領域 | 防ぎたい失敗 | 必須テスト・証跡 | 対象外の根拠 |
| --- | --- | --- | --- |
|  |  |  |  |

## 変更時の扱い

- 条件変更の承認者:
- 旧GO・旧証跡・旧承認を履歴扱いにする条件:
