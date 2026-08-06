# 詳細設計DOCGEN同期（日本語補足）

詳細設計書では、設計意図とコードから復元できる事実を分けます。現行のbundled transformはPython sourceだけに対応します。TypeScript詳細設計は手動reviewを行い、`docgen.py --check`のPASSをTypeScript同期のPASSへ読み替えません。安定したTypeScript public情報transformは[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)で扱い、この通常手順では追加しません。

1. 設計意図、業務ルール、状態遷移、権限、異常時動作、テスト観点は人間が記述する。
2. 実装前は `DOCGEN_TODO` で、フィールド・publicメンバー・APIルートなどの生成予定範囲を予約する。
3. Python実装後にDOCGENを実行すると、解決可能なTODOが `DOCGEN` へ昇格してコード由来の内容へ置換される。
4. `DOCGEN:START` と `DOCGEN:END` の間は手編集しない。
5. Python詳細設計のPR前に `--check` を実行し、コードと詳細設計のずれがないことを確認する。

具体的なマーカーとコマンドは[DOCGENガイド](../../../40_design/process/docgen.md)、エージェント手順は[英語版Skill](../../../../.agents/skills/sync-detail-design-docgen/SKILL.md)を参照します。
