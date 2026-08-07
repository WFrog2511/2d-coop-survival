import { describe, expect, test } from 'vitest';
import {
  allFloorsReachable,
  enemyVisibility,
  hasLineOfSight,
  ARENA_HEIGHT_TILES,
  ARENA_WIDTH_TILES,
  TILE_SIZE,
  findPath,
  generateArenaMap,
  generateNextArenaMap,
  nextSeed,
  respawnDelayFor,
  selectSpawnTile,
  selectAmmoBoxTiles,
  viewportTileRect,
  type ArenaMap,
  type TilePosition,
} from '../src/arena-map';

const seed = 20_260_802;

function tileKey(position: { x: number; y: number }): string {
  return `${position.x},${position.y}`;
}

function mapFrom(rows: ArenaMap['tiles']): ArenaMap {
  return {
    seed: 1,
    width: rows[0].length,
    height: rows.length,
    tileSize: 40,
    rooms: [],
    corridors: [],
    obstacles: [],
    start: { x: 1, y: 1 },
    tiles: rows,
  };
}

describe('自動生成アリーナ', () => {
  test('同一seedは同じ地形を生成し、次seedは変化する', () => {
    const first = generateArenaMap(seed);
    const second = generateArenaMap(seed);
    expect(second).toEqual(first);
    const next = generateNextArenaMap(first);
    expect(next.seed).not.toBe(first.seed);
    expect(next.tiles).not.toEqual(first.tiles);
  });

  test('通常生成は7部屋、指定サイズ、1〜3幅の通路、1マス障害物を持つ', () => {
    const map = generateArenaMap(seed);
    expect(map.rooms).toHaveLength(7);
    expect(map.rooms.every(room => room.width >= 5 && room.width <= 9)).toBe(true);
    expect(map.rooms.every(room => room.height >= 4 && room.height <= 7)).toBe(true);
    expect(map.corridors).toHaveLength(6);
    expect(map.corridors.every(corridor => corridor.width >= 1 && corridor.width <= 3)).toBe(true);
    expect(map.obstacles.length).toBeGreaterThan(0);
  });

  test('外周はwallで、すべてのfloorは開始地点から到達可能である', () => {
    const map = generateArenaMap(seed);
    for (let x = 0; x < ARENA_WIDTH_TILES; x += 1) {
      expect(map.tiles[0][x]).toBe('wall');
      expect(map.tiles[ARENA_HEIGHT_TILES - 1][x]).toBe('wall');
    }
    for (let y = 0; y < ARENA_HEIGHT_TILES; y += 1) {
      expect(map.tiles[y][0]).toBe('wall');
      expect(map.tiles[y][ARENA_WIDTH_TILES - 1]).toBe('wall');
    }
    expect(allFloorsReachable(map)).toBe(true);
  });

  test('弾薬箱はseedで決定的に4個を選び、start以外のfloorへ置く', () => {
    const map = generateArenaMap(seed);
    const boxes = selectAmmoBoxTiles(map);
    expect(boxes).toHaveLength(4);
    expect(new Set(boxes.map(tileKey))).toHaveLength(4);
    expect(boxes).not.toContainEqual(map.start);
    expect(boxes.every(position => map.tiles[position.y][position.x] === 'floor')).toBe(true);
    expect(boxes.every(position => findPath(map, map.start, position).length > 0)).toBe(true);
    expect(selectAmmoBoxTiles(map)).toEqual(boxes);
    expect(selectAmmoBoxTiles(map, [boxes[0]])).not.toContainEqual(boxes[0]);
  });

  test('初期spawnは弾薬箱の占有tileを避ける', () => {
    const map = generateArenaMap(seed);
    const boxes = selectAmmoBoxTiles(map);
    const spawned: TilePosition[] = [];
    const occupied: TilePosition[] = [map.start, ...boxes];
    for (let index = 0; index < 4; index += 1) {
      const tile = selectSpawnTile(map, {
        player: map.start,
        viewport: { left: map.start.x - 1, top: map.start.y - 1, right: map.start.x + 1, bottom: map.start.y + 1 },
        occupied: [...occupied, ...spawned],
      }, nextSeed(map.seed + index));
      if (!tile) throw new Error('初期spawn位置が必要です。');
      expect(boxes).not.toContainEqual(tile);
      expect(spawned).not.toContainEqual(tile);
      spawned.push(tile);
    }
  });

  test('BFSは4近傍の最短経路を返し、wallは通らない', () => {
    const map = generateArenaMap(seed);
    const target = map.rooms.at(-1);
    if (!target) throw new Error('終点部屋が必要です。');
    const path = findPath(map, map.start, {
      x: target.x + Math.floor(target.width / 2),
      y: target.y + Math.floor(target.height / 2),
    });
    expect(path.length).toBeGreaterThan(1);
    expect(path.every((position, index) => index === 0 || Math.abs(position.x - path[index - 1].x) + Math.abs(position.y - path[index - 1].y) === 1)).toBe(true);
    expect(findPath(map, { x: 0, y: 0 }, map.start)).toEqual([]);
  });

  test('spawnはviewport外を優先し、候補がなければ最遠floorを選ぶ', () => {
    const map = generateArenaMap(seed);
    const outside = selectSpawnTile(map, {
      player: map.start,
      viewport: { left: map.start.x - 1, top: map.start.y - 1, right: map.start.x + 1, bottom: map.start.y + 1 },
      occupied: [map.start],
    }, seed);
    expect(outside).not.toBeNull();
    if (!outside) throw new Error('画面外候補が必要です。');
    expect(outside.x < map.start.x - 1 || outside.x > map.start.x + 1 || outside.y < map.start.y - 1 || outside.y > map.start.y + 1).toBe(true);
    expect(map.tiles[outside.y][outside.x]).toBe('floor');
    expect(findPath(map, map.start, outside).length).toBeGreaterThan(0);

    const compact: ArenaMap = {
      ...map,
      width: 3,
      height: 3,
      start: { x: 1, y: 1 },
      tiles: [
        ['wall', 'wall', 'wall'],
        ['wall', 'floor', 'floor'],
        ['wall', 'floor', 'floor'],
      ],
    };
    const fallback = selectSpawnTile(compact, {
      player: { x: 1, y: 1 },
      viewport: { left: 0, top: 0, right: 2, bottom: 2 },
      occupied: [{ x: 1, y: 1 }],
    }, seed);
    expect(fallback).toEqual({ x: 2, y: 2 });

    const disconnected: ArenaMap = {
      ...map,
      width: 5,
      height: 4,
      start: { x: 1, y: 1 },
      tiles: [
        ['wall', 'wall', 'wall', 'wall', 'wall'],
        ['wall', 'floor', 'wall', 'floor', 'wall'],
        ['wall', 'floor', 'wall', 'floor', 'wall'],
        ['wall', 'wall', 'wall', 'wall', 'wall'],
      ],
    };
    expect(selectSpawnTile(disconnected, {
      player: disconnected.start,
      viewport: { left: 0, top: 0, right: 4, bottom: 3 },
      occupied: [disconnected.start],
    }, seed)).toEqual({ x: 1, y: 2 });
  });

  test('viewportの右端と下端は境界tileを含めず、部分的に見えるtileを含む', () => {
    expect(viewportTileRect({
      left: 0,
      top: 0,
      right: 20 * TILE_SIZE,
      bottom: 12 * TILE_SIZE,
    })).toEqual({ left: 0, top: 0, right: 19, bottom: 11 });
    expect(viewportTileRect({
      left: 0,
      top: 0,
      right: 20 * TILE_SIZE + 1,
      bottom: 12 * TILE_SIZE + 1,
    })).toEqual({ left: 0, top: 0, right: 20, bottom: 12 });
  });

  test('spawnは占有tileを重複選択せず、待ち時間は範囲内かつ決定的である', () => {
    const map = generateArenaMap(seed);
    const first = selectSpawnTile(map, {
      player: map.start,
      viewport: { left: map.start.x, top: map.start.y, right: map.start.x, bottom: map.start.y },
      occupied: [map.start],
    }, seed);
    if (!first) throw new Error('最初のspawnが必要です。');
    expect(selectSpawnTile(map, {
      player: map.start,
      viewport: { left: map.start.x, top: map.start.y, right: map.start.x, bottom: map.start.y },
      occupied: [map.start],
    }, seed)).toEqual(first);
    const second = selectSpawnTile(map, {
      player: map.start,
      viewport: { left: map.start.x, top: map.start.y, right: map.start.x, bottom: map.start.y },
      occupied: [map.start, first],
    }, nextSeed(seed));
    expect(second).not.toBeNull();
    expect(second && tileKey(second)).not.toBe(tileKey(first));
    const basic = respawnDelayFor('basic', 'basic-1', 2, seed);
    const drone = respawnDelayFor('drone', 'drone-1', 2, seed);
    expect(basic).toBeGreaterThanOrEqual(1300);
    expect(basic).toBeLessThanOrEqual(1900);
    expect(drone).toBeGreaterThanOrEqual(900);
    expect(drone).toBeLessThanOrEqual(1500);
    expect(respawnDelayFor('basic', 'basic-1', 2, seed)).toBe(basic);
  });
});

describe('敵の視界遮蔽', () => {
  const open = mapFrom([
    ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
    ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
    ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
    ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
    ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
  ]);
  const blocked = mapFrom([
    ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
    ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
    ['wall', 'floor', 'floor', 'wall', 'floor', 'floor', 'wall'],
    ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
    ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
  ]);

  test('same tileはnormalである', () => {
    expect(enemyVisibility(open, { x: 1, y: 1 }, { x: 1, y: 1 })).toBe('normal');
  });

  test('開けた水平・垂直・斜めLOSはnormalである', () => {
    expect(enemyVisibility(open, { x: 1, y: 2 }, { x: 5, y: 2 })).toBe('normal');
    expect(enemyVisibility(open, { x: 2, y: 1 }, { x: 2, y: 3 })).toBe('normal');
    expect(enemyVisibility(open, { x: 1, y: 1 }, { x: 5, y: 3 })).toBe('normal');
  });

  test('wall endpointは見え、その奥は遮られる', () => {
    expect(hasLineOfSight(blocked, { x: 1, y: 2 }, { x: 3, y: 2 })).toBe(true);
    expect(hasLineOfSight(blocked, { x: 1, y: 2 }, { x: 4, y: 2 })).toBe(false);
  });

  test('wall直後の敵はboundaryで、さらに2tile奥はhiddenである', () => {
    expect(enemyVisibility(blocked, { x: 1, y: 2 }, { x: 4, y: 2 })).toBe('boundary');
    expect(enemyVisibility(blocked, { x: 1, y: 2 }, { x: 5, y: 2 })).toBe('hidden');
  });

  test('orthogonal 4近傍だけをboundary候補にし、斜めだけではboundaryにしない', () => {
    const diagonalOnly = mapFrom([
      ['wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'wall', 'wall', 'floor', 'wall'],
      ['wall', 'floor', 'wall', 'floor', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'wall', 'floor', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
    ]);
    expect(hasLineOfSight(diagonalOnly, { x: 1, y: 1 }, { x: 4, y: 2 })).toBe(false);
    expect(enemyVisibility(diagonalOnly, { x: 1, y: 1 }, { x: 3, y: 3 })).toBe('hidden');
  });

  test('exact cornerの両側wallは斜めLOSを遮る', () => {
    const corner = mapFrom([
      ['wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'wall', 'floor', 'wall'],
      ['wall', 'wall', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall'],
    ]);
    expect(hasLineOfSight(corner, { x: 1, y: 1 }, { x: 3, y: 3 })).toBe(false);
  });

  test('playerまたはenemyがwall、またはいずれかがmap外ならhiddenである', () => {
    expect(enemyVisibility(blocked, { x: 3, y: 2 }, { x: 4, y: 2 })).toBe('hidden');
    expect(enemyVisibility(blocked, { x: 1, y: 2 }, { x: 3, y: 2 })).toBe('hidden');
    expect(enemyVisibility(blocked, { x: -1, y: 2 }, { x: 4, y: 2 })).toBe('hidden');
    expect(enemyVisibility(blocked, { x: 1, y: 2 }, { x: 7, y: 2 })).toBe('hidden');
  });

  test('距離上限はなく、直接LOSのnormalがboundaryより優先される', () => {
    const far = mapFrom([
      ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
    ]);
    expect(enemyVisibility(far, { x: 1, y: 1 }, { x: 7, y: 1 })).toBe('normal');
    expect(enemyVisibility(open, { x: 1, y: 1 }, { x: 5, y: 1 })).toBe('normal');
  });
});
