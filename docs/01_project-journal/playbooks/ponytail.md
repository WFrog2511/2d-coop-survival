# Ponytail導入ガイド

## 採用目的

Ponytailは、要求を理解した後にYAGNI、既存資産、標準ライブラリ、ネイティブ機能を順に検討し、保守対象を増やさないためのSkillです。このスターターでは、開発時の標準判断として `.agents/skills/ponytail/` に同梱します。

## 採用元と固定内容

| 項目 | 内容 |
| --- | --- |
| 公式リポジトリ | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) |
| 確認版 | `4.8.4` |
| 固定コミット | `16f29800fd2681bdf24f3eb4ccffe38be3baec6b` |
| ライセンス | MIT |
| 同梱範囲 | 中核の最小実装ラダーと安全境界をローカル運用向けに調整したSkill |

MIT本文は `third_party/ponytail/LICENSE` に置きます。

## スターターでの運用

1. コード作業では `AGENTS.md` の最小実装方針と `$ponytail` を適用する。
2. 既存資産を検索し、影響範囲と根本原因を確認してから最小案を選ぶ。
3. PRで「追加しなかったもの」と「再検討条件」を確認する。
4. `ponytail:` の簡略化記録を残した場合は、関連Issueにも再検討条件を置く。

Ponytailは正しさ、セキュリティ、性能、業務、アクセシビリティのレビューを置き換えません。リスク別品質ゲートと人間承認を常に優先します。

## 公式完全版を必須にしない理由

公式プラグインは6つのSkillに加えて、セッション開始・サブエージェント開始・プロンプト送信時にNodeスクリプトを呼ぶライフサイクルhookを含みます。また、持続モードや出力長の規則も持ちます。これらは有用ですが、Node依存、端末設定、hookへの信頼確認、リポジトリ固有の説明・承認規則との優先順位調整が必要です。

そのためスターターは自己完結する中核Skillだけを必須とし、公式の `ponytail-review`、`ponytail-audit`、`ponytail-debt`、`ponytail-gain`、`ponytail-help` とライフサイクルhookは同梱しません。

## 公式完全版を任意導入する場合

端末全体で持続モードや追加Skillが必要な場合だけ、[公式README](https://github.com/DietrichGebert/ponytail#readme)を確認し、次を実行します。

```powershell
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
```

Codexを再起動し、hook一覧と実行内容を人間が確認してから信頼します。プラグインの自動更新で内容が変わり得るため、スターター同梱版とは別物として扱います。
