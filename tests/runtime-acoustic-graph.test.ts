import { describe, expect, test } from 'vitest';
import {
  createSoundPropagationRenderSnapshot,
  createSoundPropagationSnapshot,
  soundWaveTilesAt,
  type AcousticPropagationCosts,
} from '../src/runtime-acoustic-graph';
import type { RuntimeAreaGraph, RuntimeAreaNode, RuntimeAreaNodeKind } from '../src/runtime-area-graph';

type NodeFixture = Readonly<{
  id: string;
  kind: RuntimeAreaNodeKind;
  tiles: readonly { x: number; y: number }[];
  neighborIds: readonly string[];
}>;

const COSTS: AcousticPropagationCosts = {
  edgeCrossingCost: 1,
  nodeCosts: {
    area: { baseCost: 1, perTileCost: 1 },
    junction: { baseCost: 1, perTileCost: 1 },
    corridor: { baseCost: 1, perTileCost: 1 },
  },
};

function graph(nodes: readonly NodeFixture[], revision = 4): RuntimeAreaGraph {
  const width = Math.max(...nodes.flatMap(node => node.tiles.map(tile => tile.x)), 0) + 1;
  const height = Math.max(...nodes.flatMap(node => node.tiles.map(tile => tile.y)), 0) + 1;
  const tileNodeIds: (string | undefined)[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => undefined));
  const runtimeNodes: RuntimeAreaNode[] = nodes.map(node => ({
    id: node.id,
    kind: node.kind,
    tiles: node.tiles.map(tile => ({ ...tile })),
    neighborIds: [...node.neighborIds],
  }));
  runtimeNodes.forEach((node) => {
    node.tiles.forEach((tile) => {
      tileNodeIds[tile.y][tile.x] = node.id;
    });
  });
  const nodeOrder = new Map(runtimeNodes.map((node, index) => [node.id, index]));
  const pairs = new Set<string>();
  runtimeNodes.forEach(node => node.neighborIds.forEach((neighborId) => {
    const left = nodeOrder.get(node.id);
    const right = nodeOrder.get(neighborId);
    if (left === undefined || right === undefined)
      return;
    pairs.add(left < right ? `${node.id}:${neighborId}` : `${neighborId}:${node.id}`);
  }));
  return {
    revision,
    nodes: runtimeNodes,
    edges: [...pairs].map((pair) => {
      const [from, to] = pair.split(':');
      return { from, to };
    }),
    tileNodeIds,
  };
}

function connectedGraph(): RuntimeAreaGraph {
  return graph([
    { id: 'area-source', kind: 'area', tiles: [{ x: 0, y: 0 }, { x: 0, y: 1 }], neighborIds: ['corridor-near'] },
    { id: 'corridor-near', kind: 'corridor', tiles: [{ x: 1, y: 0 }, { x: 2, y: 0 }], neighborIds: ['area-source'] },
    { id: 'area-disconnected', kind: 'area', tiles: [{ x: 5, y: 0 }], neighborIds: [] },
  ]);
}

describe('runtime acoustic graph', () => {
  test('sourceと接続nodeだけをstrength内へ到達させ、切断nodeを含めない', () => {
    const snapshot = createSoundPropagationSnapshot(connectedGraph(), { x: 0, y: 0 }, 6, COSTS);

    expect(snapshot?.sourceNodeId).toBe('area-source');
    expect(snapshot?.nodes.map(node => node.nodeId)).toEqual(['area-source', 'corridor-near']);
    expect(snapshot?.nodes.find(node => node.nodeId === 'corridor-near')).toMatchObject({
      arrivalCost: 4,
      predecessorNodeId: 'area-source',
      remainingStrength: 2,
    });
  });

  test('最小cost経路を選び、同costではgraph node順のpredecessorを選ぶ', () => {
    const bestPath = graph([
      { id: 'area-source', kind: 'area', tiles: [{ x: 0, y: 1 }], neighborIds: ['area-slow', 'junction-fast'] },
      { id: 'area-slow', kind: 'area', tiles: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }], neighborIds: ['area-source', 'corridor-target'] },
      { id: 'junction-fast', kind: 'junction', tiles: [{ x: 1, y: 0 }], neighborIds: ['area-source', 'corridor-target'] },
      { id: 'corridor-target', kind: 'corridor', tiles: [{ x: 2, y: 1 }], neighborIds: ['area-slow', 'junction-fast'] },
    ]);
    const best = createSoundPropagationSnapshot(bestPath, { x: 0, y: 1 }, 20, COSTS);
    expect(best?.nodes.find(node => node.nodeId === 'corridor-target')).toMatchObject({
      predecessorNodeId: 'junction-fast',
      arrivalCost: 6,
    });

    const tiedPath = graph([
      { id: 'area-source', kind: 'area', tiles: [{ x: 0, y: 1 }], neighborIds: ['junction-right', 'junction-left'] },
      { id: 'junction-left', kind: 'junction', tiles: [{ x: 1, y: 0 }], neighborIds: ['area-source', 'corridor-target'] },
      { id: 'junction-right', kind: 'junction', tiles: [{ x: 1, y: 2 }], neighborIds: ['area-source', 'corridor-target'] },
      { id: 'corridor-target', kind: 'corridor', tiles: [{ x: 2, y: 1 }], neighborIds: ['junction-left', 'junction-right'] },
    ]);
    const tied = createSoundPropagationSnapshot(tiedPath, { x: 0, y: 1 }, 20, COSTS);
    expect(tied?.nodes.find(node => node.nodeId === 'corridor-target')?.predecessorNodeId).toBe('junction-left');
  });

  test('strength不足ならsource nodeから外へ伝播しない', () => {
    const snapshot = createSoundPropagationSnapshot(connectedGraph(), { x: 0, y: 0 }, 3, COSTS);

    expect(snapshot?.nodes.map(node => node.nodeId)).toEqual(['area-source']);
  });

  test('長いcorridorは短いcorridorより次nodeへ抜けるcostが大きい', () => {
    const corridorCosts: AcousticPropagationCosts = {
      edgeCrossingCost: 1,
      nodeCosts: {
        area: { baseCost: 1, perTileCost: 0 },
        junction: { baseCost: 1, perTileCost: 0 },
        corridor: { baseCost: 0, perTileCost: 1 },
      },
    };
    const source = graph([
      { id: 'area-source', kind: 'area', tiles: [{ x: 0, y: 0 }], neighborIds: ['corridor-long', 'corridor-short'] },
      { id: 'corridor-long', kind: 'corridor', tiles: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], neighborIds: ['area-source', 'area-long-target'] },
      { id: 'corridor-short', kind: 'corridor', tiles: [{ x: 0, y: 1 }], neighborIds: ['area-source', 'area-short-target'] },
      { id: 'area-long-target', kind: 'area', tiles: [{ x: 4, y: 0 }], neighborIds: ['corridor-long'] },
      { id: 'area-short-target', kind: 'area', tiles: [{ x: 1, y: 1 }], neighborIds: ['corridor-short'] },
    ]);
    const snapshot = createSoundPropagationSnapshot(source, { x: 0, y: 0 }, 4, corridorCosts);

    expect(snapshot?.nodes.map(node => node.nodeId)).toContain('area-short-target');
    expect(snapshot?.nodes.map(node => node.nodeId)).not.toContain('area-long-target');
  });

  test('同一入力は決定的で、graph・source・costsを変更しない', () => {
    const source = connectedGraph();
    const input = { x: 0, y: 0 };
    const beforeGraph = structuredClone(source);
    const beforeSource = structuredClone(input);
    const beforeCosts = structuredClone(COSTS);

    const first = createSoundPropagationSnapshot(source, input, 6, COSTS);
    const second = createSoundPropagationSnapshot(source, input, 6, COSTS);

    expect(second).toEqual(first);
    expect(source).toEqual(beforeGraph);
    expect(input).toEqual(beforeSource);
    expect(COSTS).toEqual(beforeCosts);
  });

  test('invalid inputとrevision不一致はfailし、renderで部分tileを返さない', () => {
    const source = connectedGraph();
    const snapshot = createSoundPropagationSnapshot(source, { x: 0, y: 0 }, 6, COSTS);
    if (!snapshot)
      throw new Error('有効fixtureから音響snapshotが必要です。');

    expect(createSoundPropagationSnapshot(source, { x: 99, y: 99 }, 6, COSTS)).toBeUndefined();
    expect(() => createSoundPropagationSnapshot(source, { x: 0, y: 0 }, -1, COSTS)).toThrow();
    expect(() => createSoundPropagationSnapshot(source, { x: 0, y: 0 }, 6, {
      ...COSTS,
      edgeCrossingCost: 0,
    })).toThrow('音響edge costは0より大きい有限値である必要があります。');
    expect(() => createSoundPropagationSnapshot(source, { x: 0, y: 0 }, 6, {
      ...COSTS,
      edgeCrossingCost: -1,
    })).toThrow();
    expect(createSoundPropagationRenderSnapshot({ ...source, revision: source.revision + 1 }, snapshot)).toBeUndefined();
    expect(createSoundPropagationRenderSnapshot(source, {
      ...snapshot,
      nodes: snapshot.nodes.map(node => node.nodeId === 'corridor-near'
        ? { ...node, predecessorNodeId: 'unknown' }
        : node),
    })).toBeUndefined();
  });

  test('render viewは到達nodeのsubsetだけを含み、sourceとpredecessor境界をseedにする', () => {
    const source = connectedGraph();
    const snapshot = createSoundPropagationSnapshot(source, { x: 0, y: 0 }, 6, COSTS);
    if (!snapshot)
      throw new Error('有効fixtureから音響snapshotが必要です。');
    const render = createSoundPropagationRenderSnapshot(source, snapshot);
    if (!render)
      throw new Error('有効snapshotからrender snapshotが必要です。');
    const reached = new Set(snapshot.nodes.map(node => node.nodeId));
    const sourceTile = render.tiles.find(entry => entry.tile.x === 0 && entry.tile.y === 0);
    const boundaryTile = render.tiles.find(entry => entry.tile.x === 1 && entry.tile.y === 0);

    expect(render.tiles.every(entry => reached.has(entry.nodeId))).toBe(true);
    expect(render.tiles.some(entry => entry.nodeId === 'area-disconnected')).toBe(false);
    expect(sourceTile).toMatchObject({ nodeId: 'area-source', arrivalCost: 0, intraNodeDistance: 0 });
    expect(boundaryTile).toMatchObject({ nodeId: 'corridor-near', arrivalCost: 4, intraNodeDistance: 0 });
    expect(soundWaveTilesAt(render, 4 * 10, { costTravelMs: 10, tileTravelMs: 10, trailMs: 20 })
      .map(entry => entry.nodeId)).toContain('corridor-near');
  });
});
