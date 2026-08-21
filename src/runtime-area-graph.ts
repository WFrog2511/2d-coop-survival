import type { TilePosition } from './arena-map';
import type { RuntimeTopology } from './runtime-topology';

/** current floorを分類したruntime nodeの種類。 */
export type RuntimeAreaNodeKind = 'area' | 'junction' | 'corridor';

/** areaとして扱う最小の全floor正方形の一辺。 */
export const MIN_AREA_OPEN_SIZE_TILES = 3;

const CORRIDOR_BAND_WIDTH_TILES = MIN_AREA_OPEN_SIZE_TILES - 1;

/** 同じ種類の4近傍floor componentを表すruntime node。 */
export type RuntimeAreaNode = Readonly<{
  id: string;
  kind: RuntimeAreaNodeKind;
  tiles: readonly TilePosition[];
  neighborIds: readonly string[];
}>;

/** 異なるruntime nodeどうしが4近傍で接する無向edge。 */
export type RuntimeAreaGraphEdge = Readonly<{
  from: string;
  to: string;
}>;

/** current topologyから導出する、AIなどの後続利用向け空間graph snapshot。 */
export type RuntimeAreaGraph = Readonly<{
  revision: number;
  nodes: readonly RuntimeAreaNode[];
  edges: readonly RuntimeAreaGraphEdge[];
  tileNodeIds: readonly (readonly (string | undefined)[])[];
}>;

const CARDINAL_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
] as const;

const EDGE_DIRECTIONS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
] as const;

/**
 * current topologyから、area / junction / corridorの決定的なsnapshotを導出する。
 *
 * @param topology 分類元となる実行中terrain snapshot。
 * @returns topology revisionと対応するnode、edge、tile queryを持つgraph。
 */
export function createRuntimeAreaGraph(topology: RuntimeTopology): RuntimeAreaGraph {
  const classifications = topology.tiles.map((row, y) => row.map((tile, x) =>
    tile === 'floor' ? classifyFloorTile(topology, x, y) : undefined,
  ));
  const nodeIndexes = classifications.map(row => row.map(() => undefined as number | undefined));
  const nodes: RuntimeAreaNode[] = [];
  const kindCounts: Record<RuntimeAreaNodeKind, number> = { area: 0, junction: 0, corridor: 0 };

  for (let y = 0; y < topology.height; y += 1)
    for (let x = 0; x < topology.width; x += 1) {
      const kind = classifications[y]?.[x];
      if (!kind || nodeIndexes[y]?.[x] !== undefined)
        continue;
      const nodeIndex = nodes.length;
      const tiles = collectNodeTiles(classifications, nodeIndexes, { x, y }, kind, nodeIndex);
      kindCounts[kind] += 1;
      nodes.push({ id: `${kind}-${kindCounts[kind]}`, kind, tiles, neighborIds: [] });
    }

  const tileNodeIds = nodeIndexes.map(row => row.map(index => index === undefined ? undefined : nodes[index]?.id));
  const edges = collectEdges(nodeIndexes, nodes);
  const nodesWithNeighbors = nodes.map(node => ({
    ...node,
    neighborIds: edges.flatMap((edge) => {
      if (edge.from === node.id) return [edge.to];
      if (edge.to === node.id) return [edge.from];
      return [];
    }),
  }));
  return { revision: topology.revision, nodes: nodesWithNeighbors, edges, tileNodeIds };
}

/**
 * 指定tileを含むruntime nodeを返す。
 *
 * @param graph query対象のruntime area graph。
 * @param tile 調べるtile座標。
 * @returns floor node。wall、範囲外、未割当ならundefined。
 */
export function runtimeAreaNodeAt(graph: RuntimeAreaGraph, tile: TilePosition): RuntimeAreaNode | undefined {
  const nodeId = graph.tileNodeIds[tile.y]?.[tile.x];
  return nodeId === undefined ? undefined : graph.nodes.find(node => node.id === nodeId);
}

/**
 * nodeに4近傍で接する別nodeを決定的な順序で返す。
 *
 * @param graph query対象のruntime area graph。
 * @param nodeId 隣接nodeを調べるnode ID。
 * @returns unknown IDなら空配列、既知nodeならnode順の隣接node。
 */
export function runtimeAreaNeighbors(graph: RuntimeAreaGraph, nodeId: string): readonly RuntimeAreaNode[] {
  const node = graph.nodes.find(candidate => candidate.id === nodeId);
  if (!node)
    return [];
  return node.neighborIds
    .map(neighborId => graph.nodes.find(candidate => candidate.id === neighborId))
    .filter((neighbor): neighbor is RuntimeAreaNode => neighbor !== undefined);
}

function classifyFloorTile(topology: RuntimeTopology, x: number, y: number): RuntimeAreaNodeKind {
  if (participatesInOpenSquare(topology, x, y, MIN_AREA_OPEN_SIZE_TILES))
    return 'area';
  if (participatesInOpenSquare(topology, x, y, CORRIDOR_BAND_WIDTH_TILES))
    return 'corridor';
  const floorNeighbors = CARDINAL_DIRECTIONS.filter(direction => isFloor(topology, x + direction.x, y + direction.y));
  return floorNeighbors.length >= 3 ? 'junction' : 'corridor';
}

/** 指定tileを含む全floor正方形が一つでもあるかを調べる。 */
function participatesInOpenSquare(topology: RuntimeTopology, x: number, y: number, size: number): boolean {
  for (let originY = y - size + 1; originY <= y; originY += 1)
    for (let originX = x - size + 1; originX <= x; originX += 1)
      if (isOpenSquare(topology, originX, originY, size))
        return true;
  return false;
}

function isOpenSquare(topology: RuntimeTopology, originX: number, originY: number, size: number): boolean {
  for (let y = originY; y < originY + size; y += 1)
    for (let x = originX; x < originX + size; x += 1)
      if (!isFloor(topology, x, y))
        return false;
  return true;
}

function isFloor(topology: RuntimeTopology, x: number, y: number): boolean {
  return topology.tiles[y]?.[x] === 'floor';
}

function collectNodeTiles(
  classifications: readonly (readonly (RuntimeAreaNodeKind | undefined)[])[],
  nodeIndexes: (number | undefined)[][],
  start: TilePosition,
  kind: RuntimeAreaNodeKind,
  nodeIndex: number,
): readonly TilePosition[] {
  const pending = [start];
  const tiles: TilePosition[] = [];
  nodeIndexes[start.y][start.x] = nodeIndex;
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor];
    tiles.push(current);
    CARDINAL_DIRECTIONS.forEach((direction) => {
      const x = current.x + direction.x;
      const y = current.y + direction.y;
      if (classifications[y]?.[x] !== kind || nodeIndexes[y]?.[x] !== undefined)
        return;
      nodeIndexes[y][x] = nodeIndex;
      pending.push({ x, y });
    });
  }
  return tiles.sort(compareTiles);
}

function collectEdges(
  nodeIndexes: readonly (readonly (number | undefined)[])[],
  nodes: readonly RuntimeAreaNode[],
): readonly RuntimeAreaGraphEdge[] {
  const pairs = new Map<string, readonly [number, number]>();
  nodeIndexes.forEach((row, y) => row.forEach((nodeIndex, x) => {
    if (nodeIndex === undefined)
      return;
    EDGE_DIRECTIONS.forEach((direction) => {
      const neighborIndex = nodeIndexes[y + direction.y]?.[x + direction.x];
      if (neighborIndex === undefined || neighborIndex === nodeIndex)
        return;
      const [fromIndex, toIndex] = nodeIndex < neighborIndex
        ? [nodeIndex, neighborIndex] as const
        : [neighborIndex, nodeIndex] as const;
      pairs.set(`${fromIndex}:${toIndex}`, [fromIndex, toIndex]);
    });
  }));
  return [...pairs.values()]
    .sort(([leftFrom, leftTo], [rightFrom, rightTo]) => leftFrom - rightFrom || leftTo - rightTo)
    .map(([fromIndex, toIndex]) => ({
      from: nodes[fromIndex].id,
      to: nodes[toIndex].id,
    }));
}

function compareTiles(left: TilePosition, right: TilePosition): number {
  return left.y - right.y || left.x - right.x;
}
