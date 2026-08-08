import { describe, expect, test } from 'vitest';
import {
  allFloorsReachable,
  enemyVisibility,
  hasLineOfSight,
  ARENA_HEIGHT_TILES,
  ARENA_WIDTH_TILES,
  SPAWN_DIRECTIONS,
  SPAWN_PHASE_MS,
  TILE_SIZE,
  basicApproachRoleFor,
  findPath,
  generateArenaMap,
  generateNextArenaMap,
  hiddenRecycleThresholdFor,
  nextSeed,
  primarySpawnDirection,
  recycleDelayFor,
  respawnDelayFor,
  selectEnemySpawnTile,
  selectSpawnTile,
  selectAmmoBoxTiles,
  spawnDirectionForSlot,
  spawnPhaseAt,
  viewportTileRect,
  type ArenaMap,
  type SpawnDirection,
  type TilePosition,
} from '../src/arena-map';

const seed = 20_260_802;

function tileKey(position: { x: number; y: number }): string {
  return `${position.x},${position.y}`;
}

function directionFromPlayer(player: TilePosition, target: TilePosition): SpawnDirection {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
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

  test('12体の初期spawnは到達可能floorを使い、player、弾薬箱、他の敵と重複しない', () => {
    const map = generateArenaMap(seed);
    const boxes = selectAmmoBoxTiles(map);
    const spawned: TilePosition[] = [];
    const occupied: TilePosition[] = [map.start, ...boxes];
    const primary = primarySpawnDirection(map.seed, 0);
    for (let index = 0; index < 12; index += 1) {
      const tile = selectSpawnTile(map, {
        player: map.start,
        viewport: { left: map.start.x - 1, top: map.start.y - 1, right: map.start.x + 1, bottom: map.start.y + 1 },
        occupied: [...occupied, ...spawned],
        direction: spawnDirectionForSlot(primary, index),
      }, nextSeed(map.seed + index));
      if (!tile) throw new Error('初期spawn位置が必要です。');
      expect(boxes).not.toContainEqual(tile);
      expect(spawned).not.toContainEqual(tile);
      expect(findPath(map, map.start, tile).length).toBeGreaterThan(0);
      spawned.push(tile);
    }
    expect(new Set(spawned.map(tileKey))).toHaveLength(12);
  });

  test('60秒境界でphaseを進め、seedとphaseから4方向を決定的に切り替える', () => {
    const startedAt = 1_000;
    expect(SPAWN_PHASE_MS).toBe(60_000);
    expect(spawnPhaseAt(startedAt, startedAt - 1)).toBe(0);
    expect(spawnPhaseAt(startedAt, startedAt)).toBe(0);
    expect(spawnPhaseAt(startedAt, startedAt + SPAWN_PHASE_MS - 1)).toBe(0);
    expect(spawnPhaseAt(startedAt, startedAt + SPAWN_PHASE_MS)).toBe(1);
    expect(spawnPhaseAt(startedAt, startedAt + SPAWN_PHASE_MS * 4)).toBe(4);
    const directions = Array.from({ length: 4 }, (_, phase) => primarySpawnDirection(seed, phase));
    expect(new Set(directions)).toEqual(new Set(SPAWN_DIRECTIONS));
    expect(primarySpawnDirection(seed, 2)).toBe(directions[2]);
  });

  test('stableな12 slotは主方向9体と反対方向3体へ割り当てる', () => {
    SPAWN_DIRECTIONS.forEach((primary) => {
      const directions = Array.from({ length: 12 }, (_, slot) => spawnDirectionForSlot(primary, slot));
      const opposite = SPAWN_DIRECTIONS[(SPAWN_DIRECTIONS.indexOf(primary) + 2) % SPAWN_DIRECTIONS.length];
      expect(directions.filter(direction => direction === primary)).toHaveLength(9);
      expect(directions.filter(direction => direction === opposite)).toHaveLength(3);
      expect(directions.every(direction => direction === primary || direction === opposite)).toBe(true);
      expect(spawnDirectionForSlot(primary, 7)).toBe(directions[7]);
    });
  });

  test('方向付きspawnはplayer基準の画面外tileを選び、方向候補不足時は既存poolへfallbackする', () => {
    const directionalMap = mapFrom([
      ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
    ]);
    const player = { x: 3, y: 3 };
    const viewport = { left: 2, top: 2, right: 4, bottom: 4 };
    SPAWN_DIRECTIONS.forEach((direction, index) => {
      const tile = selectSpawnTile(directionalMap, {
        player,
        viewport,
        occupied: [player],
        direction,
      }, seed + index);
      if (!tile) throw new Error('方向付きspawn位置が必要です。');
      expect(directionFromPlayer(player, tile)).toBe(direction);
      expect(tile.x < viewport.left || tile.x > viewport.right || tile.y < viewport.top || tile.y > viewport.bottom).toBe(true);
      expect(findPath(directionalMap, player, tile).length).toBeGreaterThan(0);
    });

    const rightOnly = mapFrom([
      ['wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall'],
    ]);
    const request = {
      player: { x: 1, y: 1 },
      viewport: { left: 1, top: 1, right: 1, bottom: 1 },
      occupied: [{ x: 1, y: 1 }],
    };
    const existingPool = selectSpawnTile(rightOnly, request, seed);
    expect(selectSpawnTile(rightOnly, { ...request, direction: 'up' }, seed)).toEqual(existingPool);
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

  test('BFSはseed省略時の経路を維持し、指定時だけ最短経路のtie-breakを変える', () => {
    const open = mapFrom([
      ['wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall'],
    ]);
    const start = { x: 1, y: 1 };
    const target = { x: 3, y: 3 };
    expect(findPath(open, start, target)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ]);
    const seededPaths = Array.from({ length: 16 }, (_, tieBreakSeed) => findPath(open, start, target, tieBreakSeed));
    expect(new Set(seededPaths.map(path => JSON.stringify(path))).size).toBeGreaterThan(1);
    expect(seededPaths.every(path => path.length === 5)).toBe(true);
    expect(findPath(open, start, target, 7)).toEqual(findPath(open, start, target, 7));
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

  test('敵専用spawnは指定方向のviewport外かつhiddenな到達可能未占有tileだけを選ぶ', () => {
    const rotateRows = (rows: ArenaMap['tiles']): ArenaMap['tiles'] =>
      Array.from({ length: rows[0].length }, (_, y) =>
        Array.from({ length: rows.length }, (_, x) => rows[rows.length - 1 - x][y]));
    const rotatePosition = (position: TilePosition, height: number): TilePosition =>
      ({ x: height - 1 - position.y, y: position.x });
    let rows: ArenaMap['tiles'] = [
      ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'wall', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
    ];
    let player = { x: 1, y: 2 };
    let target = { x: 5, y: 2 };
    const directions: SpawnDirection[] = ['right', 'down', 'left', 'up'];
    const cases = directions.map((direction) => {
      const map = mapFrom(rows);
      const currentPlayer = player;
      const currentTarget = target;
      const occupied = map.tiles.flatMap((row, y) => row.flatMap((tile, x) =>
        tile === 'floor' && (x !== currentTarget.x || y !== currentTarget.y) ? [{ x, y }] : [],
      ));
      const value = { map, player: currentPlayer, target: currentTarget, occupied, direction };
      const height = rows.length;
      rows = rotateRows(rows);
      player = rotatePosition(player, height);
      target = rotatePosition(target, height);
      return value;
    });
    cases.forEach(({ map, player: casePlayer, target: caseTarget, occupied, direction }) => {
      const request = {
        player: casePlayer,
        viewport: { left: casePlayer.x, top: casePlayer.y, right: casePlayer.x, bottom: casePlayer.y },
        occupied,
        direction,
      };
      expect(selectEnemySpawnTile(map, request, seed)).toEqual(caseTarget);
      expect(enemyVisibility(map, casePlayer, caseTarget)).toBe('hidden');
      expect(findPath(map, casePlayer, caseTarget).length).toBeGreaterThan(0);
    });
    const rightCase = cases[0];
    const rightRequest = {
      player: rightCase.player,
      viewport: { left: rightCase.player.x, top: rightCase.player.y, right: rightCase.player.x, bottom: rightCase.player.y },
      occupied: rightCase.occupied,
      direction: 'right' as const,
    };
    expect(selectEnemySpawnTile(rightCase.map, { ...rightRequest, direction: 'left' }, seed)).toBeNull();
    expect(selectEnemySpawnTile(rightCase.map, { ...rightRequest, occupied: [...rightCase.occupied, rightCase.target] }, seed)).toBeNull();

    const open = mapFrom([
      ['wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall'],
    ]);
    expect(selectEnemySpawnTile(open, {
      player: { x: 1, y: 2 },
      viewport: { left: 0, top: 0, right: 1, bottom: 4 },
      occupied: [{ x: 1, y: 2 }],
      direction: 'right',
    }, seed)).toBeNull();
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

  test('spawnは占有tileを重複選択せず、各待ち時間は範囲内かつ決定的である', () => {
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
    expect(basic).toBeGreaterThanOrEqual(5000);
    expect(basic).toBeLessThanOrEqual(9000);
    expect(drone).toBeGreaterThanOrEqual(3000);
    expect(drone).toBeLessThanOrEqual(6000);
    expect(respawnDelayFor('basic', 'basic-1', 2, seed)).toBe(basic);
    const hiddenThreshold = hiddenRecycleThresholdFor('basic-1', 2, seed);
    const recycleDelay = recycleDelayFor('basic-1', 2, seed);
    expect(hiddenThreshold).toBeGreaterThanOrEqual(8000);
    expect(hiddenThreshold).toBeLessThanOrEqual(12000);
    expect(recycleDelay).toBeGreaterThanOrEqual(2000);
    expect(recycleDelay).toBeLessThanOrEqual(4000);
    expect(hiddenRecycleThresholdFor('basic-1', 2, seed)).toBe(hiddenThreshold);
    expect(recycleDelayFor('basic-1', 2, seed)).toBe(recycleDelay);
  });

  test('基本敵IDを3体ずつ固定の接近役割へ割り当てる', () => {
    expect(['basic-1', 'basic-2', 'basic-3'].map(basicApproachRoleFor)).toEqual(['direct', 'direct', 'direct']);
    expect(['basic-4', 'basic-5', 'basic-6'].map(basicApproachRoleFor)).toEqual(['left', 'left', 'left']);
    expect(['basic-7', 'basic-8', 'basic-9'].map(basicApproachRoleFor)).toEqual(['right', 'right', 'right']);
    expect(basicApproachRoleFor('drone-1')).toBeNull();
    expect(basicApproachRoleFor('basic-10')).toBeNull();
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
