---
id: REQ-ENEMY-VISIBILITY
status: agreed
approved_on: 2026-08-03
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/25
---

# enemy-visibility-v1 要件

## 目的

壁の死角にいる敵を隠し、壁際だけを共通silhouetteで示して、移動と索敵の判断を生むローカル1人用プロトタイプを提供する。

## 必須範囲

- playerとenemyのfloor tile中心間をsupercover LOSで判定し、cornerに触れるwallも遮蔽する。
- 直接見通せるenemyは通常表示、直接は不可で上下左右の可視近傍を持つenemyはboundary、その他はhiddenとする。
- 最初に当たるwall targetは可視近傍に含める。距離上限は置かない。
- boundaryは全敵共通の36×36 Canvas silhouette、alpha 0.30とし、通常復帰ではenemy固有texture、alpha 1、visible=trueへ戻す。
- LOSとnormal/boundary/hiddenの表示適用はplayer/enemy tile変更とspawn/retryで更新し、それ自体はbody、HP、AI、damageを変更しない。Issue #38の独立したrecycle policyはhidden結果を時間条件の入力として参照できる。
- player tileから現行mapの全tileへ既存supercover LOSを判定し、非可視tileだけを黒い1 pixelで`map.width×map.height`のCanvasTextureへ描く。CanvasTextureはNEARESTでmap world sizeへ拡大する単一world-space Imageへ表示し、実alphaは0.25とする。wall endpointは既存LOS規則どおり可視とする。
- mask Imageはmap、wall、enemy、silhouetteより前、playerより後ろに置く。player tile変更、create、spawn、respawn、retry、map再生成時だけCanvasTextureをclearして全tileを再描画・refreshし、毎frameのLOS判定はしない。
- E2E観測用に既存player tile outputへmaskの実alpha、暗転tile数、mask判定に使ったplayer tileをdata属性で同期する。

## 対象外

fog、照明、汎用FOV、視野角、共有視界、last-seen表示、探索履歴、距離FOV、viewport cache、bitset、HUD秘匿、盲撃ち制御、新規依存、外部asset、公開配信は含めない。Issue #38はvisibility計算を変えず、hidden継続時間だけを敵循環へ利用する限定follow-upである。

## 環境・検証・顧客確認

Windows、Chrome最新版、Node.js 22、pnpm 10.33.2で、unit、固定seed Playwright、既存戦闘/retry回帰、文書検査を行う。技術検証と顧客確認は分離し、2026-08-05の死角tile暗転変更後の索敵と不意の遭遇が生まれるかは[GitHub Issue #26](https://github.com/WFrog2511/2d-coop-survival/issues/26)で確認する。証跡はPRとIssueに残し、tag・公開配信は行わない。
