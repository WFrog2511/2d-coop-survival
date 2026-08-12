---
id: REQ-INVENTORY-V1
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/71
---

# inventory-v1 要件

## 成果物段階

Prototype standard のローカルで実プレイ可能なプロトタイプとする。所持品と world item はブラウザ内だけで扱い、永続化・通信同期は行わない。

## 合意済み要件

- 初期所持武器はライフルだけとし、ショットガンは到達可能で決定的な最初の world weapon pickup として配置する。ハンドガンは調整用設定で定める8件を、初期準備中から到達可能な別tileへ全件まとめて配置する。8件の候補を揃えられないmapでは一部だけを置かない。
- world item は stable ID、種別、tile、数量を持つ。敵撃破時は撃破tileへ素材「スクラップ」を生成し、同tileのスクラップは1件へ数量を集約する。数量に応じたsmall／medium／largeのtextureを使い、tier境界と敵種別ごとのdrop数量は調整用設定として分離する。
- `E`取得は既存の3x3近傍・照準寄りselectorを弾薬箱、武器、素材へ共通適用し、1入力で選択された1件だけを取得する。弾薬箱との競合時も既存の弾薬回復、30秒再出現、`boxId`契約を維持する。
- 未所持武器への数字キー切替は無副作用とし、ショットガン取得後は既存の射撃、弾薬、reload経路で使用する。ハンドガンは`3`で選び、ライフルと同じdamage type、damage、speed、range、spread、knockback、reloadを使う単発武器とする。magazineは10発、予備弾初期値・上限・弾薬箱回復量は10発単位の調整用設定から決める。
- ライフルとショットガンは、すでに所有している同じweaponのworld pickupを無副作用で無視する。ハンドガンはworld pickupを何件取得しても上限なく所持数を増やせるが、同じWeaponIdの弾倉・予備弾・reload状態は1組だけを共有する。個別weaponごとの弾薬は作らない。
- 画面右下付近の常時HUDは、各固定武器slotの数字キー、武器名、所持／未所持、所持数、選択中を表示し、slot 3にハンドガンを含める。スクラップ総数も表示する。
- terminal中は全pickup処理を止める。retry / new run は初期所持、各weapon所持数、全weaponの弾薬・reload状態、world weapon、スクラップ、既存弾薬箱を新しいrunへ初期化する。

## 対象外

Tabの詳細バックパック、drag & drop、slot並べ替え、容量・重量、drop／共有、クラフト、設備、役職固有補正、マルチ同期、永続化、汎用inventory framework、新規依存、balance変更は含めない。

## 受け入れ条件

- 同じmap seedと入力から同じ初期weapon itemが到達可能なtileへ置かれる。ハンドガンは設定数の8件がすべて別tileへ置かれるか、配置失敗としてrunを開始しない。
- 同tileで複数の敵を倒してもスクラップworld itemは1件で、数量だけが増え、その数量に対応するtier textureへ変わる。
- `E`取得は対象world itemを一度だけ消し、所有武器またはスクラップ数へ反映する。
- 所有前後でショットガンとハンドガンslotの切替可否とHUD表示が変わり、既存の弾薬・reload経路を利用できる。複数ハンドガン取得後も弾薬状態は1組だけである。
- terminal中の`E`は無副作用で、retry後は初期inventory、weapon数・弾薬状態、world itemだけが残る。
- 既存の弾薬箱、wave、ガンスリンガー、戦闘の契約を維持する。
