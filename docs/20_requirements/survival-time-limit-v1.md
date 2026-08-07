---
id: REQ-SURVIVAL-TIME-LIMIT
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/34#issuecomment-5218660533
implementation_task: https://github.com/WFrog2511/2d-coop-survival/issues/34
---

# survival-time-limit-v1 要件

## 根拠とDefinition of Delivery

Issue #34 の comment 5218660533 で確定した後続sliceを正本とする。成果物段階は Prototype standard のローカル検証版であり、既存のIssue #21/#35実装とammo/map配置文書は変更しない。

- 生存制限は正確に 300000ms（5分）とする。
- 5分の境界で通常状態からvictoryへ遷移し、Victory UIを表示する。
- victory中は射撃、リロード、移動、敵、弾、物理演算、敵再出現、箱復活を停止する。
- retryはタイマー、victory/defeat、map、箱、HUD、弾薬、リロードを新しいrunの初期値へ戻す。
- 取得済みammo boxは取得から300000ms後に、取得前と同じ元tileへ1個だけ復活する。
- 復活待ち中の同じ箱を重複生成しない。
- 既存の有限弾薬、ammo UI、リロード進捗表示を維持する。

実行環境は既存のPhaser/Viteブラウザプロトタイプとし、通信・永続化・外部サービスは使用しない。技術検証と顧客またはプロジェクトオーナーの受け入れ確認は別に扱う。

## #21/#35既存契約との境界

#21/#35のammo-supply-v1にある「同一run中は取得箱を再出現させない」は履歴契約として維持する。#34 follow-upが限定的にsupersedeするのはfield ammo box（map上のammo box）の再出現処理だけであり、既存の有限ammo契約、ammo/map配置文書、その他の#21/#35実装は変更しない。

survival timerとammo box復活timerはともに300000msであるため、run開始後に取得した箱の復活期限は通常survival victory後となる。この時間競合ではvictory/defeat/retryのterminal停止を優先し、復活待ちのpending callbackをキャンセル・clearして、terminal後にその箱を再出現させない。

## 受け入れ条件

1. 起動直後のHUDに残り時間 05:00 を表示し、残り時間はMM:SS形式で更新する。
2. 開始時刻から299999msではvictoryへ遷移せず、300000ms以上の境界で残り時間00:00、victory state、Victory UIとなる。
3. Victory UI表示後に戦闘処理が進まず、敗北導線と同じretry操作を使える。
4. retry後は残り時間05:00、通常state、初期ammo、リロード待機、ammo box 4個へ戻る。
5. ammo box取得時は元tileを保持し、300000ms後に同tileへ1個だけ復活する。復活待ち中の追加overlapは同じ箱のtimerや箱spriteを増やさない。
6. victory、defeat、retryでは生存、敵、リロード、敵再出現、箱復活の旧timer callbackが現在runへ副作用を与えない。
7. 既存の有限弾薬、武器切替、射撃待ち、ammo panel、リロード進捗、敗北、retryの代表経路が回帰しない。

## 対象外

recovery item、敵の時間scale変更、waveやdrop、multiplayer sync、persistence、汎用inventory/loot基盤、外部asset、既存map生成規則の変更、#21/#35の既存実装とammo/map配置文書の修正は対象外とする。新しいDOCGEN transform、matrix/readiness/evidenceもこのPrototype standard sliceでは作成しない。

## 検証と人間確認

- rules unitで300000ms直前・境界、victory terminal guard、retry初期化を検証する。
- Playwright Chromiumで05:00表示、Victory UI、戦闘停止、retry初期化、既存ammo/reload/defeat/retryを検証する。
- Playwright Chromiumでammo box取得後にpending tile keyが1つ登録され、同じoverlapを繰り返しても増えず、defeat/victory/retryのterminal停止後にclearされることをHUD属性で検証する。上記の同時刻競合のため、勝利後の正の復活は検証対象にしない。
- 文書変更後はdocsのリンク検査を実行する。
- 技術検証のPASSは顧客承認を意味しない。顧客確認はIssue #34のレビュー導線で別途記録する。
