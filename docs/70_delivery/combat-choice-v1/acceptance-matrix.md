---
release: "combat-choice-v1"
definition_of_delivery: "https://github.com/WFrog2511/2d-coop-survival/issues/12"
---

# 受け入れマトリクス

この文書は正本を複製せず、要件、仕様、実装、検証、顧客確認を結ぶ索引です。

| 受け入れID | 受け入れ項目 | 要件・仕様 | 実装 | 技術検証 | 顧客確認 | 証跡 | 制約・対象外 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-COMBAT-CHOICE | 武器別弾倉・リロードと4敵個体の最小戦闘ループ | [要件](../../20_requirements/combat-choice-v1.md)、[仕様](../../30_specs/combat-choice-v1.md) | `src/main.ts`、`src/rules.ts` | PASS | 不要 | Node 22のpnpm check（unit 8）、build、Playwright Chromium 1、Python pytest 26、Python日本語コメント、Markdown links 44、DOCGEN、matrix/readiness通常check、diff checkがPASS | 戦術差分は#14・#15で別管理。広いマップ、カメラ、障害物、経路探索、予備弾薬、第三武器、追加敵種、ウェーブ、通信、永続化、Edge、公開配信は対象外 |
| #14 | 2武器で有利な戦闘距離・立ち位置が変わる | [要件](../../20_requirements/combat-choice-v1.md)、[GitHub Issue #14](https://github.com/WFrog2511/2d-coop-survival/issues/14) | `src/main.ts`、`src/rules.ts` | PASS | 待ち [GitHub Issue #14](https://github.com/WFrog2511/2d-coop-survival/issues/14)（新実装の再確認待ち） | Node 22のpnpm check（unit 8）、build、Playwright Chromium 1、Python pytest 26、Python日本語コメント、Markdown links 44、DOCGEN、matrix/readiness通常check、diff checkがPASS。旧`249129a`の変更要求は履歴証跡 | 自動検査から戦術差分を推測しない |
| #15 | 高速ドローンで撃破優先度が変わる | [要件](../../20_requirements/combat-choice-v1.md)、[GitHub Issue #15](https://github.com/WFrog2511/2d-coop-survival/issues/15) | `src/main.ts`、`src/rules.ts` | PASS | 待ち [GitHub Issue #15](https://github.com/WFrog2511/2d-coop-survival/issues/15)（新実装の再確認待ち） | Node 22のpnpm check（unit 8）、build、Playwright Chromium 1、Python pytest 26、Python日本語コメント、Markdown links 44、DOCGEN、matrix/readiness通常check、diff checkがPASS。旧`249129a`の変更要求は履歴証跡 | 自動検査から戦術差分を推測しない |
