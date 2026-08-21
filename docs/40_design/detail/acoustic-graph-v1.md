---
id: DESIGN-DETAIL-ACOUSTIC-GRAPH-V1
requirements: REQ-ACOUSTIC-GRAPH-V1
specification: SPEC-ACOUSTIC-GRAPH-V1
---

# acoustic-graph-v1 詳細設計

## メタ情報

| 項目 | 内容 |
| --- | --- |
| 対象機能 | RuntimeAreaGraph node Dijkstraによる論理音響とrender-only tile表示 |
| 対応する基本設計 | [DESIGN-BASIC-ACOUSTIC-GRAPH-V1](../basic/acoustic-graph-v1.md) |
| 対応する要件 | [REQ-ACOUSTIC-GRAPH-V1](../../20_requirements/acoustic-graph-v1.md) |
| 対応する仕様 | [SPEC-ACOUSTIC-GRAPH-V1](../../30_specs/acoustic-graph-v1.md) |
| 関連 | [runtime-area-graph-v1 詳細設計](runtime-area-graph-v1.md)、[Issue #62](https://github.com/WFrog2511/2d-coop-survival/issues/62)、[Issue #76](https://github.com/WFrog2511/2d-coop-survival/issues/76)、[Issue #102](https://github.com/WFrog2511/2d-coop-survival/issues/102) |
| ステータス | Prototype standardの方向性確認後安定化 |
| 同期方法 | TypeScriptのため手動review。DOCGEN marker/transformを置かず、[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)のTypeScript transform対象外とする |

## 1. データと責務

| データ | 所有者 | 責務 |
| --- | --- | --- |
| `RuntimeAreaGraph` | `src/runtime-area-graph.ts` | current revisionのnode、edge、tile→node query。音響の空間正本 |
| `AcousticPropagationCosts` | `src/acoustic-data.ts` | 正のedge crossingと非負node種別の論理cost調整 |
| `SoundPropagationSnapshot` | `src/runtime-acoustic-graph.ts` | source、strength、最小node到達cost、predecessorを持つpure結果 |
| `SoundPropagationRenderSnapshot` | `src/runtime-acoustic-graph.ts` | 到達nodeだけのtile、node到達cost、node内距離を持つ描画入力 |
| `Arena.activeSoundWaves` | `src/main.ts` | 発生時刻、expiry、logical/render snapshot、action profile、発生時に固定した通常表示への採用可否をrun中だけ保持 |
| `ArenaEffects` | `src/arena/effects.ts` | 既存WebAudio oscillatorによる実音再生 |
| `AcousticDebugView` | `src/arena/hud.ts` | generated rooms、current graph、最新logical eventから導くworld/minimap共有のdebug snapshot |
| `ArenaHud` | `src/arena/hud.ts` | 通常shared tile viewの既観測tileと、debug shared graph viewをminimap Canvasへ描画 |
| native sound mode select | `index.html` / `src/main.ts` | `off` / `normal` / `debug`をrun state外で保持し、focus中のゲーム入力を隔離 |

## 2. node伝播

~~~mermaid
flowchart TD
  source["source node: arrival 0"] --> select["未確定reached nodeの最小costを選択"]
  select --> candidate["current traversal + edge cost"]
  candidate --> within{"candidate <= strength"}
  within -- no --> skip["neighborを未到達のまま残す"]
  within -- yes --> replace{"smaller cost / tie predecessor order"}
  replace -- yes --> record["arrival, remaining, predecessorを更新"]
  replace -- no --> select
  record --> select
~~~

node traversal costは`baseCost + tileCount * perTileCost`であり0を許容する。edge crossing costは0より大きい有限値である。edgeを渡るcostを加えたcandidateがstrength以内なら記録する。同costでは`RuntimeAreaGraph.nodes`の順で早いpredecessorを選ぶ。出力node群も同じnode順に揃えるため、Mapやneighbor列挙順に依存しない。

## 3. render-only展開、通常表示、debug表示

source nodeはsource tileをseedにする。後続nodeはpredecessor nodeと4近傍で接する当該node tileを全てseedにする。BFSの候補はnode自身のtile setだけであり、unreached nodeへは展開しない。各tileにはnodeの`arrivalCost`とseedからの`intraNodeDistance`を付与する。

表示時刻は次式であり、world Graphicsとminimapへ同じ`SoundWaveTile`列を渡す。

```text
arrivalMs = arrivalCost * costTravelMs + intraNodeDistance * tileTravelMs
```

`normal`modeではminimapは既存`observedTiles`に含まれるtileだけを描き、world側は既存visibility maskの下のdepthに描く。render snapshotがrevision不一致、unknown node、predecessor chain異常、境界seedなし、node内分断なら`undefined`を返し、partial tileを描かない。

logical waveの通常表示への採用可否はemit時に決める。未採用waveはrender tile viewを持たないが、最新eventになればdebugの対象になれる。採用済みwaveは新しいwaveの発生で追い出さず、自然expiryまで通常表示できる。採用数の上限は画面負荷の内部境界であり、数値を仕様・balance契約にしない。

`debug`modeでは通常tile波を描かない。current `areaGraph`の全node/edgeと`map.rooms`、同revisionの最新logical snapshotから`AcousticDebugView`を一度導出し、worldとminimapへ同一objectを渡す。nodeの到達状態は`elapsedMs >= arrivalCost * costTravelMs`で決め、predecessor edgeは到達済みnodeの`predecessorNodeId`だけから強調する。tile BFS、render snapshot、通常表示への採用可否はdebugの到達判定に使わない。debugはworldのvisibility maskとminimapの`observedTiles`制約より上に描き、未踏の全graphを明示的に開示する。

## 4. actionとlifecycle

| action | emit条件 | 実音 |
| --- | --- | --- |
| fire | `fireWeapon()`が`fired=true` | 武器profileの既存音 |
| movement | 入力、実移動、interval経過、dash/hit stop/terminal外 | 小さい足音 |
| dash | 開始位置から最初の実変位を確認 | 既存dash音を一度だけ |
| pickup | state移動とworld object削除成功後 | 回収音 |

`PlayerDash`は開始位置と`soundEmitted=false`を持つ。update時に開始位置からの実変位を最初に確認した時だけflagをtrueにし、logical snapshotとrender snapshot、実音を一回ずつ発生させる。壁密着で0距離のままcancelされるdashは発生しない。全logical waveはnatural expiryまで保持し、retry/new run、terminal、successful terrain mutationでは全wave/view/Graphicsとlatest debug eventをclearする。source/revision不一致は通常viewにもdebug eventにも入れない。

native selectの初期値は`normal`である。`off`はworld/minimapの音響描画を停止してもlogical waveのlifecycleを止めない。retry/new runはselectの選択値を変更せず、ページ再読込だけが初期値へ戻す。selectまたはそのlabelをpointerで操作してもCanvas pointer入力へ伝播させず、selectへfocusがある間は射撃、移動、dash、pickup、reload、quick slot、inventoryを実行しない。focusを外した通常のSpace/Shift dashは既存どおり実行する。

## 5. 失敗時動作

| 条件 | 動作 |
| --- | --- |
| sourceがnode外、graph構造不整合 | pure node snapshotは`undefined`、emitしない |
| 不正strength/cost/timing（0 edgeを含む） | pure APIはthrowし、設定誤りを即時に表面化する |
| graphとsnapshot revision不一致 | render snapshotは`undefined`、Arenaはold waveを描かない |
| unknown predecessor / boundaryなし / node内分断 | render snapshot全体を`undefined`にする |
| no-op fire/dash/pickup、壁密着0距離dash | 既存処理と同じくemit・実音なし |
| debug時にlogical waveなし、またはrevision不一致 | roomsとcurrent graphだけを描き、source/reached/predecessorを描かない |
| native selectへfocus | mode選択のためのDOM入力だけを受け、ゲーム入力は無作用にする |

## 6. テスト観点

| レベル | 観点 | 期待結果 |
| --- | --- | --- |
| unit | 接続/切断、最小cost、tie、strength、corridor長 | node到達とpredecessorが決定的 |
| unit | input不変、invalid、revision mismatch | graphを変更せずsafe failure |
| unit | source/predecessor seed、reached node subset | renderが到達node内だけを展開 |
| E2E | 成功射撃、三mode、通常表示採用とlogical retention、shared normal/debug view、既存Canvas minimap、retry/mutation、select focus、実移動/壁密着dash | DEV観測でsnapshot整合、描画、clear、入力隔離、dash発生条件を確認 |

TypeScript sourceは現行DOCGEN transformの対象外である。`src/runtime-acoustic-graph.ts`、`src/acoustic-data.ts`、`src/main.ts`、対象unit、Issue #102 E2Eを手動reviewして同期する。`docgen.py --check`のPASSをTypeScript同期の根拠にはしない。

## 7. 変更履歴

| 日付 | 変更内容 | 理由 |
| --- | --- | --- |
| 2026-08-20 | 初版作成 | Issue #102でtile BFSをrender-onlyへ下げ、node音響伝播を安定化 |
| 2026-08-20 | edgeとdash発生条件を補正 | edgeは正、dashは最初の実変位時だけ発生へ固定 |
| 2026-08-21 | 三modeとnode/room音響debugを同期 | logical retentionと通常表示採用を分離し、world/minimapでcurrent graphと最新eventを調査可能にした |
