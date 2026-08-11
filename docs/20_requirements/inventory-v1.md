---
id: REQ-INVENTORY-V1
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/71
---

# inventory-v1 要件

## 成果物段階

Prototype standard のローカルで実プレイ可能なプロトタイプとする。所持品と world item はブラウザ内だけで扱い、永続化・通信同期は行わない。

## 合意済み要件

- 初期所持武器はライフルだけとし、ショットガンは到達可能で決定的な最初の world weapon pickup として配置する。
- world item は stable ID、種別、tile、数量を持つ。敵撃破時は撃破tileへ素材「スクラップ」を生成し、同tileのスクラップは1件へ数量を集約する。敵種別ごとのdrop数量は調整用設定として分離する。
- `E`取得は既存の3x3近傍・照準寄りselectorを弾薬箱、武器、素材へ共通適用し、1入力で選択された1件だけを取得する。弾薬箱との競合時も既存の弾薬回復、30秒再出現、`boxId`契約を維持する。
- 未所持武器への数字キー切替は無副作用とし、ショットガン取得後は既存の射撃、弾薬、reload経路で使用する。取得時に新しい弾薬規則は追加しない。
- 画面右下付近の常時HUDは、各固定武器slotの数字キー、武器名、所持／未所持、選択中を表示し、スクラップ総数も表示する。
- terminal中は全pickup処理を止める。retry / new run は初期所持、world weapon、スクラップ、既存弾薬箱を新しいrunへ初期化する。

## 対象外

Tabの詳細バックパック、drag & drop、slot並べ替え、容量・重量、drop／共有、クラフト、設備、役職固有補正、マルチ同期、永続化、汎用inventory framework、新規依存、balance変更は含めない。

## 受け入れ条件

- 同じmap seedと入力から同じ初期weapon itemが到達可能なtileへ置かれる。
- 同tileで複数の敵を倒してもスクラップworld itemは1件で、数量だけが増える。
- `E`取得は対象world itemを一度だけ消し、所有武器またはスクラップ数へ反映する。
- 所有前後でショットガンslotの切替可否とHUD表示が変わり、既存の弾薬・reload経路を利用できる。
- terminal中の`E`は無副作用で、retry後は初期inventoryとworld itemだけが残る。
- 既存の弾薬箱、wave、ガンスリンガー、戦闘の契約を維持する。
