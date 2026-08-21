import { describe, expect, test } from 'vitest';
import { generateArenaMap } from '../src/arena-map';
import { createRuntimeTopology, type RuntimeTopology } from '../src/runtime-topology';
import { MIN_AREA_OPEN_SIZE_TILES, createRuntimeAreaGraph, runtimeAreaNeighbors, runtimeAreaNodeAt } from '../src/runtime-area-graph';

function topology(rows: readonly string[], revision = 0): RuntimeTopology {
  const width = rows[0]?.length;
  if (!width || rows.some(row => row.length !== width))
    throw new Error('同じ幅のfixture行が必要です。');
  return {
    width,
    height: rows.length,
    tileSize: 40,
    tiles: rows.map(row => [...row].map(tile => tile === '.' ? 'floor' : 'wall')),
    revision,
  };
}

describe('runtime area graph', () => {
  test('3x3 floor参加tileをareaとして同じ4近傍componentへまとめる', () => {
    const interior = '.'.repeat(MIN_AREA_OPEN_SIZE_TILES);
    const wall = '#'.repeat(MIN_AREA_OPEN_SIZE_TILES + 4);
    const graph = createRuntimeAreaGraph(topology([
      wall,
      ...Array.from({ length: MIN_AREA_OPEN_SIZE_TILES }, () => `#${interior}###`),
      wall,
    ], 4));

    const node = runtimeAreaNodeAt(graph, { x: 1, y: 1 });

    expect(graph.revision).toBe(4);
    expect(node).toMatchObject({ id: 'area-1', kind: 'area' });
    expect(node?.tiles).toEqual(Array.from({ length: MIN_AREA_OPEN_SIZE_TILES }, (_, y) =>
      Array.from({ length: MIN_AREA_OPEN_SIZE_TILES }, (_, x) => ({ x: x + 1, y: y + 1 })),
    ).flat());
    expect(runtimeAreaNodeAt(graph, { x: 0, y: 0 })).toBeUndefined();
  });

  test('3x3未満の2-wide bandはdegreeが3でもcorridorのままにする', () => {
    const bandWidth = MIN_AREA_OPEN_SIZE_TILES - 1;
    const bandLength = MIN_AREA_OPEN_SIZE_TILES + 1;
    const wall = '#'.repeat(bandLength + 2);
    const row = `#${'.'.repeat(bandLength)}#`;
    const graph = createRuntimeAreaGraph(topology([
      wall,
      ...Array.from({ length: bandWidth }, () => row),
      wall,
    ]));

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ id: 'corridor-1', kind: 'corridor' });
    expect(graph.nodes[0]?.tiles).toHaveLength(bandWidth * bandLength);
    expect(graph.nodes.some(node => node.kind === 'junction')).toBe(false);
  });

  test('細い交差はjunctionと分離したcorridorをedgeで接続する', () => {
    const graph = createRuntimeAreaGraph(topology([
      '#######',
      '###.###',
      '###.###',
      '#.....#',
      '###.###',
      '###.###',
      '#######',
    ]));
    const junction = runtimeAreaNodeAt(graph, { x: 3, y: 3 });

    expect(junction).toMatchObject({ id: 'junction-1', kind: 'junction', tiles: [{ x: 3, y: 3 }] });
    expect(runtimeAreaNeighbors(graph, junction?.id ?? '')).toHaveLength(4);
    expect(runtimeAreaNeighbors(graph, junction?.id ?? '').map(node => node.id)).toEqual(junction?.neighborIds);
    expect(graph.edges).toHaveLength(4);
    expect(new Set(runtimeAreaNeighbors(graph, junction?.id ?? '').map(node => node.kind))).toEqual(new Set(['corridor']));
  });

  test('同一topologyは同じnode IDとedge順を導出し、入力を変更しない', () => {
    const current = topology([
      '#######',
      '#...###',
      '#...###',
      '###.###',
      '###.###',
      '#######',
    ], 7);
    const before = current.tiles.map(row => [...row]);

    const first = createRuntimeAreaGraph(current);
    const second = createRuntimeAreaGraph(current);

    expect(second).toEqual(first);
    expect(current.tiles).toEqual(before);
    expect(runtimeAreaNeighbors(first, 'unknown')).toEqual([]);
  });

  test('生成map由来のfloor、wall、edgeはnodeとneighborIdsの不変条件を満たす', () => {
    const map = generateArenaMap(20_260_819);
    const current = createRuntimeTopology(map);
    const graph = createRuntimeAreaGraph(current);
    const memberships = new Map<string, string[]>();
    graph.nodes.forEach((node) => {
      node.tiles.forEach((tile) => {
        const key = `${tile.x},${tile.y}`;
        memberships.set(key, [...(memberships.get(key) ?? []), node.id]);
      });
    });

    for (let y = 0; y < current.height; y += 1)
      for (let x = 0; x < current.width; x += 1) {
        const membership = memberships.get(`${x},${y}`) ?? [];
        const nodeId = graph.tileNodeIds[y]?.[x];
        if (current.tiles[y]?.[x] === 'floor') {
          expect(membership).toHaveLength(1);
          expect(nodeId).toBe(membership[0]);
        } else {
          expect(membership).toEqual([]);
          expect(nodeId).toBeUndefined();
        }
      }

    const reserve = map.centralReserve;
    if (!reserve)
      throw new Error('標準アリーナには中央予約metadataが必要です。');
    for (let y = reserve.bounds.top; y <= reserve.bounds.bottom; y += 1)
      for (let x = reserve.bounds.left; x <= reserve.bounds.right; x += 1) {
        expect(current.tiles[y]?.[x]).toBe('wall');
        expect(graph.tileNodeIds[y]?.[x]).toBeUndefined();
      }

    const edgeKeys = graph.edges.map(edge => `${edge.from}:${edge.to}`);
    expect(new Set(edgeKeys).size).toBe(edgeKeys.length);
    const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
    graph.edges.forEach((edge) => {
      expect(nodesById.get(edge.from)?.neighborIds).toContain(edge.to);
      expect(nodesById.get(edge.to)?.neighborIds).toContain(edge.from);
    });
    graph.nodes.forEach((node) => {
      expect(new Set(node.neighborIds).size).toBe(node.neighborIds.length);
      node.neighborIds.forEach(neighborId => expect(nodesById.has(neighborId)).toBe(true));
    });
  });
});
