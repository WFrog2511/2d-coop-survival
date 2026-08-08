---
release: "prototype-v1"
definition_of_delivery: "https://github.com/WFrog2511/2d-coop-survival/issues/48"
---

# 受け入れマトリクス

この文書はprototype-v1の固定revisionに対する納品索引であり、要件・仕様・顧客確認の正本を複製しない。

| 受け入れID | 受け入れ項目 | 要件・仕様 | 実装 | 技術検証 | 顧客確認 | 証跡 | 制約・対象外 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-PROTOTYPE-LOOP | 1人用の移動・射撃・被弾・敗北・retryを含む最小戦闘ループ | [要件](../../20_requirements/prototype-v0.md)、[仕様](../../30_specs/prototype-v0.md) | `src/main.ts`、`src/rules.ts`、`e2e/prototype.spec.ts` | PASS | 承認 [#49](https://github.com/WFrog2511/2d-coop-survival/issues/49) | [証跡](../../60_output/prototype-v1-20260809-placeholder/README.md) | 通信、永続化、wave、救助は対象外 |
| REQ-COMBAT-CHOICE | 2武器・12 stable敵・80×50広域アリーナによる戦闘ループ | [要件](../../20_requirements/combat-choice-v1.md)、[仕様](../../30_specs/combat-choice-v1.md) | `src/main.ts`、`src/rules.ts`、`src/arena-map.ts`、`e2e/prototype.spec.ts` | PASS | 承認 [#49](https://github.com/WFrog2511/2d-coop-survival/issues/49) | [証跡](../../60_output/prototype-v1-20260809-placeholder/README.md) | 第三武器、追加敵、回避、wave、multiplayerは対象外 |
| REQ-ENEMY-VISIBILITY | supercover LOS、normal/boundary/hidden、死角maskによる索敵判断 | [要件](../../20_requirements/enemy-visibility-v1.md)、[仕様](../../30_specs/enemy-visibility-v1.md) | `src/main.ts`、`src/arena-map.ts`、`e2e/prototype.spec.ts` | PASS | 承認 [#26](https://github.com/WFrog2511/2d-coop-survival/issues/26) | [証跡](../../60_output/prototype-v1-20260809-placeholder/README.md) | 共有視界、fog、last-seenは対象外 |
| REQ-AMMO-SUPPLY | 有限弾薬、リロード、弾薬箱、ammo HUD | [要件](../../20_requirements/ammo-supply-v1.md)、[仕様](../../30_specs/ammo-supply-v1.md) | `src/main.ts`、`src/rules.ts`、`index.html`、`e2e/prototype.spec.ts` | PASS | 承認 [#49](https://github.com/WFrog2511/2d-coop-survival/issues/49) | [証跡](../../60_output/prototype-v1-20260809-placeholder/README.md) | inventory、loot基盤、multiplayerは対象外 |
| REQ-DIRECTIONAL-SPAWN | 60秒phase、4方向、主方向偏重、strict hidden spawnと敵循環 | [要件](../../20_requirements/directional-spawn-v1.md)、[仕様](../../30_specs/directional-spawn-v1.md) | `src/main.ts`、`src/arena-map.ts`、`e2e/prototype.spec.ts` | PASS | 承認 [#37](https://github.com/WFrog2511/2d-coop-survival/issues/37) | [証跡](../../60_output/prototype-v1-20260809-placeholder/README.md) | 汎用wave director、12体超の動的増加は対象外 |
| REQ-SURVIVAL-TIME-LIMIT | 3分生存勝利、敗北、terminal停止、retry、弾薬箱respawn | [要件](../../20_requirements/survival-time-limit-v1.md)、[仕様](../../30_specs/survival-time-limit-v1.md) | `src/main.ts`、`src/rules.ts`、`index.html`、`e2e/prototype.spec.ts` | PASS | 承認 [#49](https://github.com/WFrog2511/2d-coop-survival/issues/49) | [証跡](../../60_output/prototype-v1-20260809-placeholder/README.md) | wave、recovery item、multiplayerは対象外 |
| #19 | 発砲・着弾・撃破・被弾の演出、音、hit-stop、画面揺れ | [Issue #19](https://github.com/WFrog2511/2d-coop-survival/issues/19) | `src/main.ts`、`index.html`、`style.css` | PASS | 承認 [#49](https://github.com/WFrog2511/2d-coop-survival/issues/49) | [証跡](../../60_output/prototype-v1-20260809-placeholder/README.md) | 外部音源・新規assetは対象外 |
| #39 | 道なり距離を考慮した敵spawn候補、DEV調整、canvas位置固定 | [Issue #39](https://github.com/WFrog2511/2d-coop-survival/issues/39)、[customer review #47](https://github.com/WFrog2511/2d-coop-survival/issues/47) | `src/arena-map.ts`、`src/main.ts`、`index.html`、`style.css`、`e2e/prototype.spec.ts` | PASS | 承認 [#47](https://github.com/WFrog2511/2d-coop-survival/issues/47) | [証跡](../../60_output/prototype-v1-20260809-placeholder/README.md) | wave/preparation、ボス、役職、multiplayerは対象外 |
