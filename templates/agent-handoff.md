# Agent引き継ぎ

> 引き継ぎは実行権限・顧客承認・merge承認を移さない。Issue / Definition of Delivery、対象ファイル、現在diff、直近gate結果、停止条件だけを渡し、raw historyやraw logを複製しない。

## 現在地と境界

- GitHub Issue / Definition of Delivery:
- profile:
- branch / current commit:
- sole writer:
- 変更してよいファイル / 明確な対象外:
- 完了したこと:
- 未完了・停止条件:

## 次のcheckpoint

- planner / reviewerの確認事項:
- writer開始条件:
- 最終diff reviewの要否:
- 実行する変更駆動gate:

## 試行と失敗

| 試行 | 実行内容 | 結果 | 失敗原因 | 再試行条件 |
| --- | --- | --- | --- | --- |
| 1 |  |  |  |  |

同じ原因での再試行は2回までとし、3回目が必要なら前提変更、追加権限、人間判断のいずれが必要かを明記する。通常の書込みが実際に失敗した場合だけ、対象検証済みの原子的置換とbackupを使う。

## 次の担当が使うもの

- 正本の要件・仕様:
- 変更ファイル:
- 検証コマンドと結果:
- 証跡:
- 次の一手:
