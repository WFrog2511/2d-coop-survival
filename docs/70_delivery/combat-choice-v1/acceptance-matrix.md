---
release: "combat-choice-v1"
definition_of_delivery: "https://github.com/WFrog2511/2d-coop-survival/issues/12"
---

# 受け入れマトリクス

この文書は正本を複製せず、要件、仕様、実装、検証、顧客確認を結ぶ索引です。

| 受け入れID | 受け入れ項目 | 要件・仕様 | 実装 | 技術検証 | 顧客確認 | 証跡 | 制約・対象外 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-COMBAT-CHOICE | 2武器・4敵個体・自動生成アリーナの最小戦闘ループ | [要件](../../20_requirements/combat-choice-v1.md)、[仕様](../../30_specs/combat-choice-v1.md) | `src/main.ts`、`src/rules.ts`、`src/arena-map.ts` | PASS | 不要 | Node 22のlint、typecheck、TypeScript日本語コメント規則、unit 16、build、Playwright Chromium 1、Python pytest 26、Python日本語コメント、Markdown links 45、DOCGEN、matrix/readiness通常check、diff checkがPASS | 戦術差分は#14・#15、map操作性は#17で別管理。視界・霧、破壊可能地形、map保存、A*、navmesh、予備弾薬、第三武器、追加敵種、ウェーブ、通信、永続化、Edge、公開配信は対象外 |
| #14 | 2武器で有利な戦闘距離・立ち位置が変わる | [要件](../../20_requirements/combat-choice-v1.md)、[GitHub Issue #14](https://github.com/WFrog2511/2d-coop-survival/issues/14) | `src/main.ts`、`src/rules.ts` | PASS | 承認 [GitHub Issue #14](https://github.com/WFrog2511/2d-coop-survival/issues/14) | `11893cb`の技術PASSと顧客承認 | #15・#17の変更対応は#14の承認を変更しない |
| #15 | 高速ドローンで撃破優先度が変わる | [要件](../../20_requirements/combat-choice-v1.md)、[GitHub Issue #15](https://github.com/WFrog2511/2d-coop-survival/issues/15) | `src/main.ts`、`src/rules.ts`、`src/arena-map.ts` | PASS | 待ち [GitHub Issue #15](https://github.com/WFrog2511/2d-coop-survival/issues/15)（自動生成map上の再確認待ち） | 現変更の全技術検査PASS。旧`d57e600`の技術PASSと追加変更要求は履歴証跡 | 自動検査から撃破優先度を推測しない |
| #17 | 自動生成mapで移動と遮蔽物の判断が成立する | [要件](../../20_requirements/combat-choice-v1.md)、[GitHub Issue #17](https://github.com/WFrog2511/2d-coop-survival/issues/17) | `src/arena-map.ts`、`src/main.ts` | PASS | 待ち [GitHub Issue #17](https://github.com/WFrog2511/2d-coop-survival/issues/17) | map unit 6、Playwright代表E2E 1、Solによるin-app Browser視覚確認（grid、wall、player、drone表示、browser errorなし） | 自動検査から移動の分かりやすさ・遮蔽物の戦術価値を推測しない |