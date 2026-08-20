import type { TilePosition } from './arena-map';
import type { RuntimeAreaGraph, RuntimeAreaNode, RuntimeAreaNodeKind } from './runtime-area-graph';

/** nodeを一つ抜けるために加算する音響cost。 */
export type AcousticNodeCost = Readonly<{
  baseCost: number;
  perTileCost: number;
}>;

/** Runtime Area Graph上の音響伝播を調整するcost群。 */
export type AcousticPropagationCosts = Readonly<{
  edgeCrossingCost: number;
  nodeCosts: Readonly<Record<RuntimeAreaNodeKind, AcousticNodeCost>>;
}>;

/** 一つの到達nodeと、音源からの最小cost・前段node。 */
export type AcousticNodePropagation = Readonly<{
  nodeId: string;
  arrivalCost: number;
  remainingStrength: number;
  predecessorNodeId?: string;
}>;

/** Runtime Area Graphだけから導出する論理音響伝播snapshot。 */
export type SoundPropagationSnapshot = Readonly<{
  revision: number;
  source: TilePosition;
  sourceNodeId: string;
  initialStrength: number;
  nodes: readonly AcousticNodePropagation[];
}>;

/** 到達node内だけを展開した描画用tile。 */
export type SoundPropagationRenderTile = Readonly<{
  tile: TilePosition;
  nodeId: string;
  arrivalCost: number;
  intraNodeDistance: number;
}>;

/** node伝播snapshotを一度だけtile表示へ落としたsnapshot。 */
export type SoundPropagationRenderSnapshot = Readonly<{
  revision: number;
  source: TilePosition;
  sourceNodeId: string;
  initialStrength: number;
  tiles: readonly SoundPropagationRenderTile[];
}>;

/** 描画時点で残像を持つ一つの到達tile。 */
export type SoundWaveTile = SoundPropagationRenderTile & Readonly<{
  alpha: number;
}>;

/** node costとnode内tile距離を表示時間へ変換する設定。 */
export type SoundWaveTiming = Readonly<{
  costTravelMs: number;
  tileTravelMs: number;
  trailMs: number;
}>;

type GraphIndex = Readonly<{
  nodeById: ReadonlyMap<string, RuntimeAreaNode>;
  nodeOrder: ReadonlyMap<string, number>;
}>;

const CARDINAL_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
] as const;

/**
 * current Runtime Area Graphを正本として、strength内の到達nodeを決定的に導出する。
 *
 * @param graph current terrain revisionに対応するRuntime Area Graph。
 * @param source 発砲などの音源tile。
 * @param initialStrength 音が消えるまでに消費できる論理strength。
 * @param costs node種別とedgeを渡るための調整cost。
 * @returns 音源がfloor node外またはgraph不整合ならundefined。
 */
export function createSoundPropagationSnapshot(
  graph: RuntimeAreaGraph,
  source: TilePosition,
  initialStrength: number,
  costs: AcousticPropagationCosts,
): SoundPropagationSnapshot | undefined {
  assertStrength(initialStrength);
  assertCosts(costs);
  assertTile(source);
  const index = graphIndex(graph);
  if (!index)
    return undefined;
  const sourceNodeId = graph.tileNodeIds[source.y]?.[source.x];
  const sourceNode = sourceNodeId ? index.nodeById.get(sourceNodeId) : undefined;
  if (!sourceNodeId || !sourceNode || !sourceNode.tiles.some(tile => tile.x === source.x && tile.y === source.y))
    return undefined;

  const reached = new Map<string, AcousticNodePropagation>([
    [sourceNodeId, {
      nodeId: sourceNodeId,
      arrivalCost: 0,
      remainingStrength: initialStrength,
    }],
  ]);
  const pending = new Set(index.nodeById.keys());
  while (pending.size > 0) {
    const currentNodeId = nextReachedNodeId(pending, reached, index.nodeOrder);
    if (!currentNodeId)
      break;
    pending.delete(currentNodeId);
    const current = reached.get(currentNodeId);
    const currentNode = index.nodeById.get(currentNodeId);
    if (!current || !currentNode)
      return undefined;
    const traversalCost = costForNode(currentNode, costs);
    const neighborIds = [...currentNode.neighborIds]
      .sort((left, right) => (index.nodeOrder.get(left) ?? Number.POSITIVE_INFINITY) - (index.nodeOrder.get(right) ?? Number.POSITIVE_INFINITY));
    for (const neighborId of neighborIds) {
      if (neighborId === sourceNodeId)
        continue;
      if (!index.nodeById.has(neighborId))
        return undefined;
      const arrivalCost = current.arrivalCost + traversalCost + costs.edgeCrossingCost;
      if (arrivalCost > initialStrength)
        continue;
      const previous = reached.get(neighborId);
      if (!shouldReplacePropagation(previous, arrivalCost, currentNodeId, index.nodeOrder))
        continue;
      reached.set(neighborId, {
        nodeId: neighborId,
        arrivalCost,
        remainingStrength: Math.max(0, initialStrength - arrivalCost),
        predecessorNodeId: currentNodeId,
      });
    }
  }

  return {
    revision: graph.revision,
    source: { ...source },
    sourceNodeId,
    initialStrength,
    nodes: graph.nodes.flatMap((node) => {
      const propagation = reached.get(node.id);
      return propagation ? [propagation] : [];
    }),
  };
}

/**
 * 到達nodeだけを、sourceまたはpredecessor境界からnode内限定でtile化する。
 *
 * @param graph 音響snapshotと同revisionのRuntime Area Graph。
 * @param snapshot node単位で到達済みの論理伝播snapshot。
 * @returns revision・node・境界が不整合なら部分描画せずundefined。
 */
export function createSoundPropagationRenderSnapshot(
  graph: RuntimeAreaGraph,
  snapshot: SoundPropagationSnapshot,
): SoundPropagationRenderSnapshot | undefined {
  if (graph.revision !== snapshot.revision)
    return undefined;
  const index = graphIndex(graph);
  if (!index || !isValidSnapshot(snapshot, graph, index))
    return undefined;
  const propagationByNodeId = new Map(snapshot.nodes.map(propagation => [propagation.nodeId, propagation]));
  const tileGroups: Array<readonly SoundPropagationRenderTile[]> = [];
  for (const node of graph.nodes) {
    const propagation = propagationByNodeId.get(node.id);
    if (!propagation)
      continue;
    const seeds = node.id === snapshot.sourceNodeId
      ? [{ ...snapshot.source }]
      : predecessorBoundarySeeds(graph, node, propagation.predecessorNodeId ?? '');
    if (!seeds || seeds.length === 0)
      return undefined;
    const tiles = renderNodeTiles(node, seeds, propagation.arrivalCost);
    if (!tiles)
      return undefined;
    tileGroups.push(tiles);
  }
  return {
    revision: snapshot.revision,
    source: { ...snapshot.source },
    sourceNodeId: snapshot.sourceNodeId,
    initialStrength: snapshot.initialStrength,
    tiles: tileGroups.flat(),
  };
}

/**
 * node到達costとnode内距離から、現在画面へ残す音波tileだけを返す。
 *
 * @param snapshot 到達node内だけを含む描画snapshot。
 * @param elapsedMs 音が発生してからの経過時間。
 * @param timing node costとnode内tileの表示時間、残像時間。
 * @returns 到着済みかつ残像中のtile列。
 */
export function soundWaveTilesAt(
  snapshot: SoundPropagationRenderSnapshot,
  elapsedMs: number,
  timing: SoundWaveTiming,
): readonly SoundWaveTile[] {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
    return [];
  assertTiming(timing);
  return snapshot.tiles.flatMap((entry) => {
    const arrivalMs = entry.arrivalCost * timing.costTravelMs + entry.intraNodeDistance * timing.tileTravelMs;
    const age = elapsedMs - arrivalMs;
    if (age < 0 || age > timing.trailMs)
      return [];
    return [{ ...entry, alpha: 1 - age / timing.trailMs }];
  });
}

/** 音波が画面から消えるまでに必要な時間を返す。 */
export function soundWaveLifetimeMs(snapshot: SoundPropagationRenderSnapshot, timing: SoundWaveTiming): number {
  assertTiming(timing);
  const latestArrivalMs = snapshot.tiles.reduce((latest, entry) => Math.max(
    latest,
    entry.arrivalCost * timing.costTravelMs + entry.intraNodeDistance * timing.tileTravelMs,
  ), 0);
  return latestArrivalMs + timing.trailMs;
}

function graphIndex(graph: RuntimeAreaGraph): GraphIndex | undefined {
  const nodeById = new Map<string, RuntimeAreaNode>();
  const nodeOrder = new Map<string, number>();
  for (const [order, node] of graph.nodes.entries()) {
    if (!isNodeKind(node.kind) || !node.id || nodeById.has(node.id) || node.tiles.length === 0)
      return undefined;
    nodeById.set(node.id, node);
    nodeOrder.set(node.id, order);
  }
  for (const node of graph.nodes) {
    const tileKeys = new Set<string>();
    for (const tile of node.tiles) {
      if (!isTilePosition(tile) || graph.tileNodeIds[tile.y]?.[tile.x] !== node.id || tileKeys.has(tileKey(tile)))
        return undefined;
      tileKeys.add(tileKey(tile));
    }
    if (new Set(node.neighborIds).size !== node.neighborIds.length)
      return undefined;
    for (const neighborId of node.neighborIds) {
      const neighbor = nodeById.get(neighborId);
      if (!neighbor || !neighbor.neighborIds.includes(node.id))
        return undefined;
    }
  }
  return { nodeById, nodeOrder };
}

function isValidSnapshot(snapshot: SoundPropagationSnapshot, graph: RuntimeAreaGraph, index: GraphIndex): boolean {
  if (!isTilePosition(snapshot.source) || !Number.isFinite(snapshot.initialStrength) || snapshot.initialStrength < 0)
    return false;
  if (graph.tileNodeIds[snapshot.source.y]?.[snapshot.source.x] !== snapshot.sourceNodeId)
    return false;
  const sourceNode = index.nodeById.get(snapshot.sourceNodeId);
  if (!sourceNode || !sourceNode.tiles.some(tile => tile.x === snapshot.source.x && tile.y === snapshot.source.y))
    return false;
  const propagations = new Map<string, AcousticNodePropagation>();
  for (const propagation of snapshot.nodes) {
    if (
      !index.nodeById.has(propagation.nodeId)
      || propagations.has(propagation.nodeId)
      || !Number.isFinite(propagation.arrivalCost)
      || propagation.arrivalCost < 0
      || propagation.arrivalCost > snapshot.initialStrength
      || !Number.isFinite(propagation.remainingStrength)
      || propagation.remainingStrength < 0
      || propagation.remainingStrength !== Math.max(0, snapshot.initialStrength - propagation.arrivalCost)
    ) return false;
    propagations.set(propagation.nodeId, propagation);
  }
  const source = propagations.get(snapshot.sourceNodeId);
  if (!source || source.arrivalCost !== 0 || source.predecessorNodeId !== undefined)
    return false;
  for (const propagation of snapshot.nodes) {
    if (propagation.nodeId === snapshot.sourceNodeId)
      continue;
    const node = index.nodeById.get(propagation.nodeId);
    const predecessorId = propagation.predecessorNodeId;
    const predecessor = predecessorId ? propagations.get(predecessorId) : undefined;
    if (!node || !predecessorId || !predecessor || !node.neighborIds.includes(predecessorId))
      return false;
    if (predecessor.arrivalCost > propagation.arrivalCost)
      return false;
    if (!hasPredecessorPathToSource(propagation, propagations, snapshot.sourceNodeId))
      return false;
  }
  return true;
}

function hasPredecessorPathToSource(
  propagation: AcousticNodePropagation,
  propagations: ReadonlyMap<string, AcousticNodePropagation>,
  sourceNodeId: string,
): boolean {
  const seen = new Set<string>();
  let current: AcousticNodePropagation | undefined = propagation;
  while (current) {
    if (current.nodeId === sourceNodeId)
      return true;
    if (!current.predecessorNodeId || seen.has(current.nodeId))
      return false;
    seen.add(current.nodeId);
    current = propagations.get(current.predecessorNodeId);
  }
  return false;
}

function predecessorBoundarySeeds(
  graph: RuntimeAreaGraph,
  node: RuntimeAreaNode,
  predecessorNodeId: string,
): readonly TilePosition[] | undefined {
  if (!predecessorNodeId || !node.neighborIds.includes(predecessorNodeId))
    return undefined;
  const seeds = node.tiles.filter(tile => CARDINAL_DIRECTIONS.some(direction =>
    graph.tileNodeIds[tile.y + direction.y]?.[tile.x + direction.x] === predecessorNodeId,
  ));
  return seeds.length === 0 ? undefined : [...seeds].sort(compareTiles);
}

function renderNodeTiles(
  node: RuntimeAreaNode,
  seeds: readonly TilePosition[],
  arrivalCost: number,
): readonly SoundPropagationRenderTile[] | undefined {
  const nodeTileKeys = new Set(node.tiles.map(tileKey));
  const distances = new Map<string, number>();
  const pending = [...seeds].sort(compareTiles);
  pending.forEach((seed) => {
    const key = tileKey(seed);
    if (!nodeTileKeys.has(key))
      return;
    distances.set(key, 0);
  });
  if (distances.size === 0)
    return undefined;
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor];
    const currentDistance = distances.get(tileKey(current));
    if (currentDistance === undefined)
      return undefined;
    CARDINAL_DIRECTIONS.forEach((direction) => {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = tileKey(next);
      if (!nodeTileKeys.has(key) || distances.has(key))
        return;
      distances.set(key, currentDistance + 1);
      pending.push(next);
    });
  }
  if (distances.size !== node.tiles.length)
    return undefined;
  return node.tiles.map((tile) => {
    const intraNodeDistance = distances.get(tileKey(tile));
    if (intraNodeDistance === undefined)
      throw new Error('到達node内のtile距離を導出できません。');
    return { tile: { ...tile }, nodeId: node.id, arrivalCost, intraNodeDistance };
  });
}

function nextReachedNodeId(
  pending: ReadonlySet<string>,
  reached: ReadonlyMap<string, AcousticNodePropagation>,
  nodeOrder: ReadonlyMap<string, number>,
): string | undefined {
  let selected: AcousticNodePropagation | undefined;
  for (const nodeId of pending) {
    const candidate = reached.get(nodeId);
    if (!candidate)
      continue;
    if (
      !selected
      || candidate.arrivalCost < selected.arrivalCost
      || (candidate.arrivalCost === selected.arrivalCost
        && (nodeOrder.get(candidate.nodeId) ?? Number.POSITIVE_INFINITY) < (nodeOrder.get(selected.nodeId) ?? Number.POSITIVE_INFINITY))
    ) selected = candidate;
  }
  return selected?.nodeId;
}

function shouldReplacePropagation(
  previous: AcousticNodePropagation | undefined,
  arrivalCost: number,
  predecessorNodeId: string,
  nodeOrder: ReadonlyMap<string, number>,
): boolean {
  if (!previous || arrivalCost < previous.arrivalCost)
    return true;
  if (arrivalCost !== previous.arrivalCost || !previous.predecessorNodeId)
    return false;
  return (nodeOrder.get(predecessorNodeId) ?? Number.POSITIVE_INFINITY)
    < (nodeOrder.get(previous.predecessorNodeId) ?? Number.POSITIVE_INFINITY);
}

function costForNode(node: RuntimeAreaNode, costs: AcousticPropagationCosts): number {
  const cost = costs.nodeCosts[node.kind];
  return cost.baseCost + node.tiles.length * cost.perTileCost;
}

function assertStrength(strength: number): void {
  if (!Number.isFinite(strength) || strength < 0)
    throw new Error('音響strengthは0以上の有限値である必要があります。');
}

function assertCosts(costs: AcousticPropagationCosts): void {
  if (!Number.isFinite(costs.edgeCrossingCost) || costs.edgeCrossingCost <= 0)
    throw new Error('音響edge costは0より大きい有限値である必要があります。');
  (['area', 'junction', 'corridor'] as const).forEach((kind) => {
    const cost = costs.nodeCosts[kind];
    if (!cost || !Number.isFinite(cost.baseCost) || cost.baseCost < 0 || !Number.isFinite(cost.perTileCost) || cost.perTileCost < 0)
      throw new Error(`${kind}の音響node costは0以上の有限値である必要があります。`);
  });
}

function assertTiming(timing: SoundWaveTiming): void {
  if (!Number.isFinite(timing.costTravelMs) || timing.costTravelMs <= 0)
    throw new Error('音響costの表示時間は正の有限値である必要があります。');
  if (!Number.isFinite(timing.tileTravelMs) || timing.tileTravelMs <= 0)
    throw new Error('音響node内tileの表示時間は正の有限値である必要があります。');
  if (!Number.isFinite(timing.trailMs) || timing.trailMs <= 0)
    throw new Error('音響残像時間は正の有限値である必要があります。');
}

function assertTile(tile: TilePosition): void {
  if (!isTilePosition(tile))
    throw new Error('音源tileは安全な整数座標である必要があります。');
}

function isNodeKind(kind: string): kind is RuntimeAreaNodeKind {
  return kind === 'area' || kind === 'junction' || kind === 'corridor';
}

function isTilePosition(tile: TilePosition): boolean {
  return Number.isSafeInteger(tile.x) && Number.isSafeInteger(tile.y) && tile.x >= 0 && tile.y >= 0;
}

function tileKey(tile: TilePosition): string {
  return `${tile.x},${tile.y}`;
}

function compareTiles(left: TilePosition, right: TilePosition): number {
  return left.y - right.y || left.x - right.x;
}
