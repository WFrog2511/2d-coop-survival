import { describe, expect, test } from 'vitest';
import { findPath, generateArenaMap, type ArenaMap, type CentralReserve, type TilePosition } from '../src/arena-map';
import { applyRuntimeTopologyMutations, createRuntimeTopology, type RuntimeTopologyMutation } from '../src/runtime-topology';

const seed = 20_260_819;

function requiredCentralReserve(map: ArenaMap): CentralReserve {
  const reserve = map.centralReserve;
  if (!reserve)
    throw new Error('標準アリーナには中央予約metadataが必要です。');
  return reserve;
}

function normalWall(map: ArenaMap): TilePosition {
  const reserve = requiredCentralReserve(map);
  for (let y = 1; y < map.height - 1; y += 1)
    for (let x = 1; x < map.width - 1; x += 1) {
      const inReserve = x >= reserve.bounds.left
        && x <= reserve.bounds.right
        && y >= reserve.bounds.top
        && y <= reserve.bounds.bottom;
      if (map.tiles[y][x] === 'wall' && !inReserve)
        return { x, y };
    }
  throw new Error('中央予約と外周の外に通常wallが必要です。');
}

function wallBesideFloor(map: ArenaMap): { wall: TilePosition; floor: TilePosition } {
  const reserve = requiredCentralReserve(map);
  for (let y = 1; y < map.height - 1; y += 1)
    for (let x = 1; x < map.width - 1; x += 1) {
      const inReserve = x >= reserve.bounds.left
        && x <= reserve.bounds.right
        && y >= reserve.bounds.top
        && y <= reserve.bounds.bottom;
      if (map.tiles[y][x] !== 'wall' || inReserve)
        continue;
      const floor = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ].find(tile => map.tiles[tile.y]?.[tile.x] === 'floor');
      if (floor)
        return { wall: { x, y }, floor };
    }
  throw new Error('通常wallに隣接するfloorが必要です。');
}

describe('runtime topology', () => {
  test('ArenaMapのtileを深く複製し、初期revisionを0にする', () => {
    const map = generateArenaMap(seed);
    const wall = normalWall(map);
    const topology = createRuntimeTopology(map);

    map.tiles[wall.y][wall.x] = 'floor';

    expect(topology.revision).toBe(0);
    expect(topology.tiles[wall.y]?.[wall.x]).toBe('wall');
    expect(topology.tiles).not.toBe(map.tiles);
    expect(topology.tiles[wall.y]).not.toBe(map.tiles[wall.y]);
  });

  test('有効batchは一度だけrevisionを進め、生成mapを変更しない', () => {
    const map = generateArenaMap(seed);
    const topology = createRuntimeTopology(map);
    const reserve = requiredCentralReserve(map);
    const first = normalWall(map);
    const second = normalWall({
      ...map,
      tiles: map.tiles.map((row, y) => row.map((tile, x) => x === first.x && y === first.y ? 'floor' : tile)),
    });

    const next = applyRuntimeTopologyMutations(topology, [
      { ...first, tile: 'floor' },
      { ...second, tile: 'floor' },
    ], reserve);

    expect(next.revision).toBe(1);
    expect(next.tiles[first.y]?.[first.x]).toBe('floor');
    expect(next.tiles[second.y]?.[second.x]).toBe('floor');
    expect(map.tiles[first.y][first.x]).toBe('wall');
    expect(map.tiles[second.y][second.x]).toBe('wall');
  });

  test('全件no-opは同じsnapshotとrevisionを維持する', () => {
    const map = generateArenaMap(seed);
    const topology = createRuntimeTopology(map);

    const next = applyRuntimeTopologyMutations(topology, [{ ...map.start, tile: 'floor' }], requiredCentralReserve(map));

    expect(next).toBe(topology);
    expect(next.revision).toBe(0);
  });

  test('不正batchは一件も反映せず、座標・tile・予約・外周を拒否する', () => {
    const map = generateArenaMap(seed);
    const topology = createRuntimeTopology(map);
    const candidate = normalWall(map);
    const reserve = requiredCentralReserve(map);
    const before = topology.tiles.map(row => [...row]);
    const invalidTile = { ...candidate, tile: 'void' } as unknown as RuntimeTopologyMutation;

    expect(() => applyRuntimeTopologyMutations(topology, [{ ...candidate, tile: 'floor' }, { x: 0, y: 1, tile: 'floor' }], reserve)).toThrow();
    expect(() => applyRuntimeTopologyMutations(topology, [{ x: -1, y: 1, tile: 'floor' }], reserve)).toThrow();
    expect(() => applyRuntimeTopologyMutations(topology, [{ x: reserve.bounds.left, y: reserve.bounds.top, tile: 'floor' }], reserve)).toThrow();
    expect(() => applyRuntimeTopologyMutations(topology, [{ x: 1.5, y: 1, tile: 'floor' }], reserve)).toThrow();
    expect(() => applyRuntimeTopologyMutations(topology, [invalidTile], reserve)).toThrow();
    expect(topology.revision).toBe(0);
    expect(topology.tiles).toEqual(before);
  });

  test('中央予約metadataが欠けたbatchはfail fastでrejectionする', () => {
    const map = generateArenaMap(seed);
    const topology = createRuntimeTopology(map);
    const candidate = normalWall(map);
    const before = topology.tiles.map(row => [...row]);

    expect(() => applyRuntimeTopologyMutations(
      topology,
      [{ ...candidate, tile: 'floor' }],
      undefined as unknown as CentralReserve,
    )).toThrow('中央予約metadata');
    expect(topology.revision).toBe(0);
    expect(topology.tiles).toEqual(before);
  });

  test('同一座標の重複batchは最後の値を採用し、revisionを一度だけ進める', () => {
    const map = generateArenaMap(seed);
    const topology = createRuntimeTopology(map);
    const wall = normalWall(map);

    const next = applyRuntimeTopologyMutations(topology, [
      { ...wall, tile: 'floor' },
      { ...wall, tile: 'wall' },
      { ...wall, tile: 'floor' },
    ], requiredCentralReserve(map));

    expect(next.tiles[wall.y]?.[wall.x]).toBe('floor');
    expect(next.revision).toBe(1);
  });

  test('current topologyへの変更後はBFSが開いたtileを通れる', () => {
    const map = generateArenaMap(seed);
    const topology = createRuntimeTopology(map);
    const { wall, floor } = wallBesideFloor(map);

    expect(findPath(topology, floor, wall)).toEqual([]);
    const next = applyRuntimeTopologyMutations(topology, [{ ...wall, tile: 'floor' }], requiredCentralReserve(map));

    const path = findPath(next, floor, wall);
    expect(path).toEqual([floor, wall]);
    expect(map.tiles[wall.y][wall.x]).toBe('wall');
  });
});
