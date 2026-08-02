# 公開リポジトリ向けライセンス調査

- 調査日: 2026-08-02
- 対象: 企画書記載の直接利用候補、既存Ponytail派生物、将来のゲーム素材
- 結論: このリポジトリの独自コード・文書にはMIT Licenseを採用する。
- 注意: これは公開情報に基づくプロジェクト内確認であり、個別案件の法律相談ではない。

## 選定理由

[Open Source InitiativeのMIT原文](https://opensource.org/license/mit)は、利用、改変、複製、公開、配布、サブライセンス、販売を許可し、コピーまたは重要部分に著作権表示と許諾表示を残すことを条件とする。今回の「誰でも自由に利用できる公開リポジトリ」という目的に合い、短く運用しやすい。

ルートMITは第三者著作物を再ライセンスしない。第三者のライセンス本文、著作権表示、NOTICE、帰属表示は各条件に従って保持する。

## 予定スタックの確認

| 対象 | 確認したライセンス | 初期判断 |
| --- | --- | --- |
| [Phaser](https://github.com/phaserjs/phaser) | MIT | 直接利用候補として問題なし。ただしexamplesの素材は別条件 |
| [Vite](https://github.com/vitejs/vite/blob/main/LICENSE) | MIT | 直接利用候補として問題なし |
| [Colyseus](https://github.com/colyseus/colyseus) | MIT | 直接利用候補として問題なし |
| [Zod](https://github.com/colinhacks/zod/blob/main/LICENSE) | MIT | 直接利用候補として問題なし |
| [Vitest](https://github.com/vitest-dev/vitest/blob/main/LICENSE) | MIT | 開発依存候補として問題なし |
| [pnpm](https://github.com/pnpm/pnpm/blob/main/LICENSE) | MIT | 開発ツール候補として問題なし |
| [TypeScript](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt) | Apache-2.0 | 利用可能。再配布物では元ライセンスと必要な通知を保持する |
| [Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE) | Apache-2.0 | 開発依存候補として利用可能。元通知を保持する |
| [Node.js](https://github.com/nodejs/node/blob/main/LICENSE) | MITを中心とする複合通知 | 実行環境として利用可能。Node本体を同梱配布するときは完全な通知を保持する |
| [Ponytail](https://github.com/DietrichGebert/ponytail/blob/main/LICENSE) | MIT | 既存の派生Skillと原文を保持する |

Apache Software Foundationの[ライセンスFAQ](https://www.apache.org/foundation/license-faq.html)が説明する通り、Apache-2.0由来物を別ライセンスの成果物で配布しても、元のライセンス条件と帰属表示は残る。ルートMITだけを表示して第三者条件を消さない。

## ゲーム素材の境界

[Phaser公式examples](https://github.com/phaserjs/examples)は、exampleコードはMITでもassetsは同じ条件ではなく、商用ゲーム等で利用できないものがあると明記している。このため、サンプル素材をそのままゲームへコピーしない。

外部のスプライト、音源、フォント、マップ素材は次を満たすものだけを採用する。

1. 自作、または商用利用・改変・再配布を許すライセンスである。
2. 出所URL、作者、取得日、ライセンス、必要な帰属表示、変更内容を記録する。
3. 「NonCommercial」「personal use only」「再配布禁止」は、公開MITリポジトリの標準候補にしない。
4. 帰属不要を優先する場合は、Creative Commonsが説明する[CC0](https://creativecommons.org/public-domain/)を第一候補にする。
5. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)を使う場合は、作者、ライセンス、元素材へのリンク、変更有無を表示する。

## 今回の対応

- ルートに`LICENSE`を置き、著作権者を`WFrog2511`、年を2026とする。
- `THIRD_PARTY_NOTICES.md`から既存PonytailのMIT本文へ案内する。
- まだ導入していない予定依存を、同梱済みであるかのようには通知へ記載しない。
- package lockfile作成後と公開build前に、直接・推移依存のライセンスを再監査する。
- 最初の外部ゲーム素材を追加する前に、素材台帳と帰属表示の配置を決める。