# Project-local harness overrides

- このリポジトリでは [AGENTS.md](../../AGENTS.md) のプロジェクト固有ruleを中央ハーネスより優先する。
- 既存のPonytail local adaptationは維持し、中央版で置換しない。
- task / Issue / Git / GitHub とagent orchestrationはSOL rootが担当し、Terra Max planner/reviewerとsole writerのrole分離を維持する。
- 最終TypeScript full gateは `corepack pnpm check` とする。
- MCPはこのプロジェクトの範囲に限定し、read-onlyで利用する。
- Windowsのpnpm extensionless / `.cmd` shimをcodex-lsp-bridgeのNode spawnが起動できないため、`.codex/lsp-client.json`でpackageのJavaScript entryをNodeから直接起動する。bridgeのWindows local server解決が修正された版へ更新できたら、このproject-local overrideを撤去する。
- codex-lsp-bridge 0.3.3の`lsp_status` / `doctor`はglobal `~/.codex/config.toml`だけを見てproject-scoped MCP設定とlocal language server overrideを報告しない。global installerは実行せず、actual MCP semantic callを疎通の正本とする。bridgeがproject-scoped config/statusとlocal overrideを正しく報告する版へ更新できたら、この記述を撤去する。
- codex-lsp-bridge 0.3.3の`lsp_diagnostics`はclean fileで`publishDiagnostics`を受けずtimeoutする場合があり、結果はinconclusiveのためallowlistから除外済みである。`corepack pnpm check`またはtypecheckの代替にせず、intentional errorを正しく返す版へ更新できたら再有効化し、この記述を撤去する。
- `.github/ISSUE_TEMPLATE/question.yml` と `.github/ISSUE_TEMPLATE/config.yml` は既存のproject固有Formを維持する。
- `テスト設計と調整値` のruleは、Issue #68における1 consumer / 1観測に基づくlocal overrideである。独立consumerで再発し合計2 consumerとなった場合だけ、sanitized evidenceを添えて中央候補としてreviewする。security、privacy、data-lossに関わるものはこの閾値を待たずreviewする。
- 操作感や画面を人間と反復調整するPrototype standardでは、暫定的に[試遊優先モード](playtest-first.md)を選択できる。方向性確認前の自動testと独立reviewを必要最小限にし、確認後の安定化で正本・test・review・PR gateをそろえる。
