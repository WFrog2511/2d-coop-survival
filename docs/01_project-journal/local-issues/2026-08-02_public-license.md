# GitHub Issue #2: 公開リポジトリのライセンスを決める

> [GitHub Issue #2](https://github.com/WFrog2511/2d-coop-survival/issues/2)へ移行済み。この文書はオフライン作業時の決定記録として保持する。

## 状態

- 種別: decision
- 状態: 決定
- 日付: 2026-08-02
- リスク区分: 標準

## 決めること

誰でも利用・改変・再配布できる公開リポジトリとして、独自コードと文書に適用するライセンス、第三者通知、ゲーム素材の採用境界を決める。

## 決定

- ルートライセンス: MIT
- Copyright: `Copyright (c) 2026 WFrog2511`
- 第三者著作物: 元ライセンスと著作権表示を保持し、ルートMITへ再ライセンスしない。
- ゲーム素材: 自作またはCC0を優先する。CC BYは帰属表示を実装できる場合だけ使う。NC、個人利用限定、再配布禁止素材は標準候補にしない。

## 根拠

[公開リポジトリ向けライセンス調査](../../10_research/2026-08-02_public-license-review.md)を参照する。予定する直接利用候補はMITまたはApache-2.0を中心とし、ルートMITと両立する。公開build前にはlockfileを基準に推移依存を再監査する。

## 反映先

- [LICENSE](../../../LICENSE)
- [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md)
- [README.md](../../../README.md)
- [AGENTS.md](../../../AGENTS.md)

## 検証

- 予定する直接利用候補のライセンスを公式リポジトリまたは公式ライセンスページで確認した。
- ルートMIT本文、Ponytail同梱MIT、Third-Party Noticesの参照を確認した。
- リポジトリ内の秘密鍵、代表的なtoken、固定credential形式の簡易パターン検査は該当なし。
- package lockfileとゲーム素材はまだ存在しないため、導入時と公開build前の再監査を必須とする。
## GitHub移行結果

- GitHub Issue: [#2](https://github.com/WFrog2511/2d-coop-survival/issues/2)（completed）
