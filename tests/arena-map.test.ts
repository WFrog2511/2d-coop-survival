import { describe, expect, test } from 'vitest';
import {
  allFloorsReachable,
  AMMO_BOX_COUNT,
  enemyVisibility,
  hasLineOfSight,
  ARENA_HEIGHT_TILES,
  ARENA_WIDTH_TILES,
  ARENA_CENTER,
  CENTRAL_RESERVE_SIZE_TILES,
  SPAWN_DIRECTIONS,
  SPAWN_PHASE_MS,
  TILE_SIZE,
  WORLD_WEAPON_DROP_MAX_PATH_DISTANCE,
  basicApproachRoleFor,
  findPath,
  generateArenaMap,
  generateFallbackArenaMap,
  generateNextArenaMap,
  hiddenRecycleThresholdFor,
  nextSeed,
  primarySpawnDirection,
  recycleDelayFor,
  respawnDelayFor,
  selectEnemySpawnTile,
  selectInitialWeaponPickupTile,
  selectInitialWeaponPickupTiles,
  selectSpawnTile,
  selectAmmoBoxTiles,
  selectWorldWeaponDropTile,
  spawnDirectionForSlot,
  spawnPhaseAt,
  viewportTileRect,
  type ArenaMap,
  type SpawnDirection,
  type TilePosition,
} from '../src/arena-map';
import { INITIAL_WORLD_WEAPON_MODELS } from '../src/game-data';

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

function expectStandardArenaInvariants(map: ArenaMap): void {
  expect(map.width).toBe(ARENA_WIDTH_TILES);
  expect(map.height).toBe(ARENA_HEIGHT_TILES);
  expect(map.width % 2).toBe(1);
  expect(map.height % 2).toBe(1);
  expect(map.tiles).toHaveLength(map.height);
  expect(map.tiles.every(row => row.length === map.width)).toBe(true);

  const center = { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
  const halfReserveSize = Math.floor(CENTRAL_RESERVE_SIZE_TILES / 2);
  const bounds = {
    left: center.x - halfReserveSize,
    top: center.y - halfReserveSize,
    right: center.x + halfReserveSize,
    bottom: center.y + halfReserveSize,
  };
  const reserve = map.centralReserve;
  if (!reserve)
    throw new Error('標準アリーナには中央予約metadataが必要です。');
  expect(ARENA_CENTER).toEqual(center);
  expect(CENTRAL_RESERVE_SIZE_TILES % 2).toBe(1);
  expect(reserve.bounds).toEqual(bounds);
  expect(bounds.right - bounds.left + 1).toBe(CENTRAL_RESERVE_SIZE_TILES);
  expect(bounds.bottom - bounds.top + 1).toBe(CENTRAL_RESERVE_SIZE_TILES);
  for (let y = bounds.top; y <= bounds.bottom; y += 1)
    for (let x = bounds.left; x <= bounds.right; x += 1)
      expect(map.tiles[y][x]).toBe('wall');

  const expectedApproaches: Record<SpawnDirection, TilePosition> = {
    up: { x: center.x, y: bounds.top - 1 },
    right: { x: bounds.right + 1, y: center.y },
    down: { x: center.x, y: bounds.bottom + 1 },
    left: { x: bounds.left - 1, y: center.y },
  };
  expect(reserve.approaches).toEqual(expectedApproaches);
  SPAWN_DIRECTIONS.forEach((direction) => {
    const approach = reserve.approaches[direction];
    expect(map.tiles[approach.y][approach.x]).toBe('floor');
    expect(findPath(map, map.start, approach).length).toBeGreaterThan(0);
  });
  expect(map.tiles[map.start.y][map.start.x]).toBe('floor');
  expect(allFloorsReachable(map)).toBe(true);
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

  test('通常生成は設定と中央予約metadataから導かれる境界・接近経路を持つ', () => {
    const map = generateArenaMap(seed);
    expectStandardArenaInvariants(map);
  });

  test('代表seedも同じ標準アリーナ不変条件を満たす', () => {
    [15, seed, nextSeed(seed)].forEach((fixedSeed) => {
      const map = generateArenaMap(fixedSeed);
      expectStandardArenaInvariants(map);
    });
  });

  test('fallbackも設定由来の予約領域と到達可能な接近経路を維持する', () => {
    const map = generateFallbackArenaMap(seed);
    expectStandardArenaInvariants(map);
  });

  test('fallbackは4主方向それぞれで12 slotの厳格な方向spawn候補を確保する', () => {
    const map = generateFallbackArenaMap(seed);
    const viewport = {
      left: map.start.x - 10,
      top: map.start.y - 6,
      right: map.start.x + 10,
      bottom: map.start.y + 6,
    };
    SPAWN_DIRECTIONS.forEach((primary) => {
      const occupied: TilePosition[] = [map.start, ...selectAmmoBoxTiles(map)];
      for (let slot = 0; slot < 12; slot += 1) {
        const direction = spawnDirectionForSlot(primary, slot);
        const tile = selectEnemySpawnTile(map, {
          player: map.start,
          viewport,
          occupied,
          direction,
        }, nextSeed(map.seed + slot));
        if (!tile) throw new Error(`fallbackの${primary}主方向、${slot}番目の厳格な方向spawn位置が必要です。`);
        expect(enemyVisibility(map, map.start, tile)).toBe('hidden');
        expect(directionFromPlayer(map.start, tile)).toBe(direction);
        occupied.push(tile);
      }
    });
  });

  test('外周はwallで、すべてのfloorは開始地点から到達可能である', () => {
    const map = generateArenaMap(seed);
    for (let x = 0; x < map.width; x += 1) {
      expect(map.tiles[0][x]).toBe('wall');
      expect(map.tiles[map.height - 1][x]).toBe('wall');
    }
    for (let y = 0; y < map.height; y += 1) {
      expect(map.tiles[y][0]).toBe('wall');
      expect(map.tiles[y][map.width - 1]).toBe('wall');
    }
    expect(allFloorsReachable(map)).toBe(true);
  });

  test('弾薬箱はseedで決定的に、開始地点・占有tile・相互の3x3取得範囲を避ける', () => {
    const map = generateArenaMap(seed);
    const boxes = selectAmmoBoxTiles(map);
    expect(boxes).toHaveLength(AMMO_BOX_COUNT);
    expect(new Set(boxes.map(tileKey))).toHaveLength(boxes.length);
    expect(boxes.every(box => Math.abs(box.x - map.start.x) > 1 || Math.abs(box.y - map.start.y) > 1)).toBe(true);
    expect(boxes.every(position => map.tiles[position.y][position.x] === 'floor')).toBe(true);
    expect(boxes.every(position => findPath(map, map.start, position).length > 0)).toBe(true);
    expect(selectAmmoBoxTiles(map)).toEqual(boxes);
    expect(boxes.every((box, index) => boxes.slice(index + 1).every(other =>
      Math.abs(box.x - other.x) > 1 || Math.abs(box.y - other.y) > 1,
    ))).toBe(true);
    const occupied = boxes[0];
    if (!occupied)
      throw new Error('占有範囲確認用の弾薬箱が必要です。');
    const excludingOccupied = selectAmmoBoxTiles(map, [occupied]);
    expect(excludingOccupied.every(box =>
      Math.abs(box.x - occupied.x) > 1 || Math.abs(box.y - occupied.y) > 1,
    )).toBe(true);
    expect(selectAmmoBoxTiles(map, [occupied])).toEqual(excludingOccupied);
  });

  test('弾薬箱候補が不足するときは、到達可能な候補だけを返す', () => {
    const map = mapFrom([
      ['wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall'],
    ]);
    const requestedCount = map.width * map.height;
    const boxes = selectAmmoBoxTiles(map, [], requestedCount);
    const available = { x: map.start.x + 2, y: map.start.y };
    expect(boxes).toEqual([available]);
    expect(boxes.length).toBeLessThan(requestedCount);
    expect(findPath(map, map.start, available).length).toBeGreaterThan(0);
  });

  test('初期武器pickupは開始地点と弾薬箱の3x3取得範囲を避けた到達可能tileを決定的に選ぶ', () => {
    const map = generateArenaMap(seed);
    const boxes = selectAmmoBoxTiles(map);
    const pickup = selectInitialWeaponPickupTile(map, boxes);
    if (!pickup) throw new Error('初期武器pickupのtileが必要です。');
    expect(selectInitialWeaponPickupTile(map, boxes)).toEqual(pickup);
    expect(Math.abs(pickup.x - map.start.x) > 1 || Math.abs(pickup.y - map.start.y) > 1).toBe(true);
    expect(boxes.every(box => Math.abs(pickup.x - box.x) > 1 || Math.abs(pickup.y - box.y) > 1)).toBe(true);
    expect(findPath(map, map.start, pickup).length).toBeGreaterThan(0);
  });

  test('初期world weaponは全floorから全件を決定的かつ3x3非重複で選ぶ', () => {
    const map = generateArenaMap(seed);
    const boxes = selectAmmoBoxTiles(map);
    const first = selectInitialWeaponPickupTiles(map, boxes, INITIAL_WORLD_WEAPON_MODELS.length);
    const second = selectInitialWeaponPickupTiles(map, boxes, INITIAL_WORLD_WEAPON_MODELS.length);
    expect(second).toEqual(first);
    expect(first).toHaveLength(INITIAL_WORLD_WEAPON_MODELS.length);
    expect(new Set(first.map(tileKey))).toHaveLength(first.length);
    expect(first.every(tile => Math.abs(tile.x - map.start.x) > 1 || Math.abs(tile.y - map.start.y) > 1)).toBe(true);
    expect(first.every(tile => boxes.every(box => Math.abs(tile.x - box.x) > 1 || Math.abs(tile.y - box.y) > 1))).toBe(true);
    expect(first.every(tile => findPath(map, map.start, tile).length > 0)).toBe(true);
    expect(first.every((tile, index) => first.slice(index + 1).every(other =>
      Math.abs(tile.x - other.x) > 1 || Math.abs(tile.y - other.y) > 1,
    ))).toBe(true);
  });

  test('world weapon dropはplayer tileを優先し、近傍の到達可能floorだけを決定的に選ぶ', () => {
    const map = mapFrom([
      ['wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'wall', 'floor', 'wall'],
      ['wall', 'floor', 'floor', 'floor', 'floor', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
    ]);
    expect(selectWorldWeaponDropTile(map, map.start)).toEqual(map.start);

    const occupiedStart = [map.start];
    const nearest = selectWorldWeaponDropTile(map, map.start, occupiedStart);
    if (!nearest)
      throw new Error('開始tileを除いたworld weapon drop候補が必要です。');
    expect(findPath(map, map.start, nearest).length - 1).toBe(1);
    expect(selectWorldWeaponDropTile(map, map.start, occupiedStart)).toEqual(nearest);

    const allNearbyFloors = map.tiles.flatMap((row, y) => row.flatMap((tile, x) => {
      const position = { x, y };
      return tile === 'floor' && findPath(map, map.start, position).length - 1 <= WORLD_WEAPON_DROP_MAX_PATH_DISTANCE
        ? [position]
        : [];
    }));
    expect(selectWorldWeaponDropTile(map, map.start, allNearbyFloors)).toBeNull();
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

  test('中央帯の開始部屋は代表seedで12体の厳格な方向spawn候補を確保する', () => {
    const map = generateArenaMap(1);
    const viewport = {
      left: map.start.x - 10,
      top: map.start.y - 6,
      right: map.start.x + 10,
      bottom: map.start.y + 6,
    };
    const occupied: TilePosition[] = [map.start, ...selectAmmoBoxTiles(map)];
    const primary = primarySpawnDirection(map.seed, 0);
    for (let slot = 0; slot < 12; slot += 1) {
      const direction = spawnDirectionForSlot(primary, slot);
      const tile = selectEnemySpawnTile(map, {
        player: map.start,
        viewport,
        occupied,
        direction,
      }, nextSeed(map.seed + slot));
      if (!tile) throw new Error(`${slot}番目の厳格な方向spawn位置が必要です。`);
      expect(enemyVisibility(map, map.start, tile)).toBe('hidden');
      expect(directionFromPlayer(map.start, tile)).toBe(direction);
      occupied.push(tile);
    }
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

  test('敵spawnは近いBFS候補の上位poolからseedで選び、候補不足時も条件を緩めない', () => {
    const map = generateArenaMap(seed);
    const player = map.start;
    const viewport = { left: player.x, top: player.y, right: player.x, bottom: player.y };
    const candidatesByDirection = SPAWN_DIRECTIONS.map(direction => ({
      direction,
      candidates: map.tiles.flatMap((row, y) => row.flatMap((tile, x) => {
        const position = { x, y };
        return tile === 'floor'
          && (x < viewport.left || x > viewport.right || y < viewport.top || y > viewport.bottom)
          && directionFromPlayer(player, position) === direction
          && findPath(map, player, position).length > 0
          && enemyVisibility(map, player, position) === 'hidden'
          ? [position]
          : [];
      })),
    }));
    const selectedDirection = candidatesByDirection.find(({ candidates }) => candidates.length > 10);
    if (!selectedDirection) throw new Error('上位10候補を確認できる厳格なspawn方角が必要です。');
    const ranked = selectedDirection.candidates
      .map(position => ({ position, distance: findPath(map, player, position).length - 1 }))
      .sort((left, right) => left.distance - right.distance || left.position.y - right.position.y || left.position.x - right.position.x);
    const request = {
      player,
      viewport,
      occupied: [player],
      direction: selectedDirection.direction,
    };

    expect(selectEnemySpawnTile(map, request, 71, 1)).toEqual(ranked[0].position);
    const seeded = selectEnemySpawnTile(map, request, 7, 10);
    expect(seeded).toEqual(ranked[7].position);
    expect(selectEnemySpawnTile(map, request, 7, 10)).toEqual(seeded);

    const available = ranked.slice(0, 3);
    const availableKeys = new Set(available.map(candidate => tileKey(candidate.position)));
    const limited = selectEnemySpawnTile(map, {
      ...request,
      occupied: [player, ...selectedDirection.candidates.filter(position => !availableKeys.has(tileKey(position)))],
    }, 4);
    expect(limited).toEqual(available[1].position);
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
    const compactMap = { width: 20, height: 16, tileSize: TILE_SIZE / 2 };
    expect(viewportTileRect({
      left: compactMap.tileSize * 3,
      top: compactMap.tileSize * 2,
      right: compactMap.tileSize * 7,
      bottom: compactMap.tileSize * 5,
    }, compactMap)).toEqual({ left: 3, top: 2, right: 6, bottom: 4 });
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
