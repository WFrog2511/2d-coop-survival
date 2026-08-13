---
id: REQ-INVENTORY-V1
status: agreed
definition_of_delivery: https://github.com/WFrog2511/2d-coop-survival/issues/71
---

# inventory-v1 要件

## 成果物段階

Prototype standard のローカルで実プレイ可能なプロトタイプとする。所持品と world item はブラウザ内だけで扱い、永続化・通信同期は行わない。

## 合意済み要件

- 初期所持武器はライフルだけとし、クイックスロット1へ置く。world weaponはショットガンと、ハンドガン・リボルバー・コンパクトピストルを混在させた8件のsidearm modelを、初期準備中から到達可能な別tileへ全件まとめて配置する。弾薬箱とworld weaponを含むすべての初期pickupは、開始地点および相互の3x3取得範囲を避け、開始近傍へ優先せずfloor全体からseed決定的に分散する。全件を置けないmapでは一部だけを置かない。
- world item は stable ID、種別、tile、数量を持つ。敵撃破時は撃破tileへ素材「スクラップ」を生成し、同tileのスクラップは1件へ数量を集約する。数量に応じたsmall／medium／largeのtextureを使い、tier境界と敵種別ごとのdrop数量は調整用設定として分離する。
- `E`取得は既存の3x3近傍・照準寄りselectorを弾薬箱、武器、素材へ共通適用し、1入力で選択された1件だけを取得する。promptは対象名を1行目、操作を2行目に表示し、武器名、スクラップ数量、弾薬箱の予備弾薬補給を読めるようにする。弾薬箱との競合時も既存の弾薬回復、30秒再出現、`boxId`契約を維持する。
- 所持品は3個のクイックスロットと10個のバックパック枠を持つ。world weaponは取得順に空きクイックスロット、次に空きバックパックへ1個ずつ非stack格納する。合計13枠が満杯なら取得は無副作用でworld weaponを残す。`1`〜`3`はweapon種ではなく対応するクイックスロットを選択する。選択中slotを詳細インベントリ操作で空にした場合は位置を保ったままactive weaponなしとなり、発射とリロードは無作用である。
- ハンドガン、リボルバー、コンパクトピストルは見た目と名称だけが異なるmodelで、いずれも既存`WeaponId`のhandgunへ解決する。ライフルと同じdamage type、damage、speed、range、spread、knockback、reloadを使う単発武器とし、magazineは10発、予備弾初期値・上限・弾薬箱回復量は10発単位の調整用設定から決める。複数sidearm modelでも弾倉・予備弾・reload状態は1組だけを共有し、個別weaponごとの弾薬は作らない。
- 画面下部中央の常時quickbarは3クイックスロットを横並びにし、数字キー、簡潔な武器icon、model名、空き／選択中と右端のスクラップ総数を表示する。Tabでnonmodalの詳細インベントリを開閉し、13枠の武器をnative HTML5 drag & dropで操作する。空き先へはmove、占有先へはswapし、stackしない。詳細インベントリ外のgame領域へdropした武器は、player tileを最優先に、到達可能floorの道なり距離2以下で近い順、同距離はseed/tile順で決定的にworldへ置く。壁、active world item、active ammo box、active enemyは除外し、候補を確定するまでinventoryを減らさない。候補がない場合はstateとworldを変えず`置ける場所がありません`を表示する。
- terminal中は全pickup処理を止め、Tab画面を閉じる。retry / new run は初期クイックスロット、バックパック、全weaponの弾薬・reload状態、world weapon、スクラップ、既存弾薬箱を新しいrunへ初期化する。

## 対象外

touch操作、素材のdrag & drop、武器の個体別弾倉・耐久・改造、modelごとのbalance差、重量、容量拡張、クラフト、設備、役職固有補正、マルチ同期、永続化、汎用inventory framework、新規依存、balance変更は含めない。drag & drop、クイックスロットとバックパック間の移動・並べ替え、worldへのweapon dropを対象外とした旧記述は#71追加slice以前の履歴である。

## 受け入れ条件

- 同じmap seedと入力から同じ初期pickupが到達可能なfloor tileへ置かれる。弾薬箱と全初期weaponは開始地点および相互の3x3取得範囲を避け、sidearm 8件を含む全world weaponが置かれるか、配置失敗としてrunを開始しない。
- 同tileで複数の敵を倒してもスクラップworld itemは1件で、数量だけが増え、その数量に対応するtier textureへ変わる。
- `E`取得は対象world itemを一度だけ消し、所有武器またはスクラップ数へ反映する。
- 取得順にquick slot、backpackへ非stack格納され、満杯時のworld weaponは残る。詳細インベントリは13枠のmove/swapとgame領域へのworld dropを行え、選択中quick slotを空にするとactive weaponなしで発射・リロードは無作用となる。world dropが失敗した場合はinventory/worldを変えず通知する。
- sidearm modelを複数取得しても弾薬状態は1組だけである。terminal中の`E`は無副作用でTabは閉じ、retry後は初期inventory、弾薬状態、world itemだけが残る。
- 既存の弾薬箱、wave、ガンスリンガー、戦闘の契約を維持する。
