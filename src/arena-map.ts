export const TILE_SIZE = 40;
export const ARENA_WIDTH_TILES = 40;
export const ARENA_HEIGHT_TILES = 25;
export const AMMO_BOX_COUNT = 4;

export type Tile = 'wall' | 'floor';

export type TilePosition = { x: number; y: number };
export type TileRect = { left: number; top: number; right: number; bottom: number };
export type Room = { x: number; y: number; width: number; height: number };
export type Corridor = { from: TilePosition; to: TilePosition; width: number; horizontalFirst: boolean };
export type ArenaEnemyKind = 'basic' | 'drone';
export type EnemyVisibility = 'normal' | 'boundary' | 'hidden';

export type ArenaMap = {
  seed: number;
  width: number;
  height: number;
  tileSize: number;
  tiles: Tile[][];
  rooms: Room[];
  corridors: Corridor[];
  obstacles: TilePosition[];
  start: TilePosition;
};

export type SpawnRequest = {
  player: TilePosition;
  viewport: TileRect;
  occupied: readonly TilePosition[];
};

class SeededRandom {
  constructor(private state: number) {}

  next(): number {
    this.state = nextSeed(this.state);
    return this.state;
  }

  integer(minimum: number, maximum: number): number {
    return minimum + (this.next() % (maximum - minimum + 1));
  }
}

export function nextSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 1_664_525) + 1_013_904_223) >>> 0;
}

export function generateArenaMap(seed: number): ArenaMap {
  let candidateSeed = seed >>> 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const map = generateCandidate(seed >>> 0, candidateSeed, false);
    if (map && allFloorsReachable(map)) return map;
    candidateSeed = nextSeed(candidateSeed);
  }
  return generateCandidate(seed >>> 0, candidateSeed, true) as ArenaMap;
}

export function generateNextArenaMap(current: ArenaMap): ArenaMap {
  let seed = nextSeed(current.seed);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = generateArenaMap(seed);
    if (!sameTileLayout(current, candidate)) return candidate;
    seed = nextSeed(seed);
  }
  throw new Error('異なるアリーナを生成できません。');
}

export function isFloor(map: ArenaMap, position: TilePosition): boolean {
  return position.x >= 0
    && position.y >= 0
    && position.x < map.width
    && position.y < map.height
    && map.tiles[position.y][position.x] === 'floor';
}

/** プレイヤーから対象tileへの見通しを、cornerを含む全通過tileで判定する。 */
export function hasLineOfSight(
  map: ArenaMap,
  player: TilePosition,
  target: TilePosition,
): boolean {
  if (!isFloor(map, player) || !inBounds(map, target)) return false;
  const line = supercoverLine(player, target);
  return line.every((position, index) => index === line.length - 1 || map.tiles[position.y][position.x] !== 'wall');
}

/** 敵floorの通常表示、壁際の共通silhouette、非表示を純粋に決める。 */
export function enemyVisibility(
  map: ArenaMap,
  player: TilePosition,
  enemy: TilePosition,
): EnemyVisibility {
  if (!isFloor(map, player) || !isFloor(map, enemy)) return 'hidden';
  if (hasLineOfSight(map, player, enemy)) return 'normal';
  return neighbours(enemy).some(neighbour => hasLineOfSight(map, player, neighbour))
    ? 'boundary'
    : 'hidden';
}

export function findPath(
  map: ArenaMap,
  start: TilePosition,
  target: TilePosition,
): TilePosition[] {
  if (!isFloor(map, start) || !isFloor(map, target)) return [];
  const startKey = positionKey(start);
  const targetKey = positionKey(target);
  const queue = [start];
  const previous = new Map<string, TilePosition | null>([[startKey, null]]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (positionKey(current) === targetKey) break;
    neighbours(current).forEach((next) => {
      const key = positionKey(next);
      if (!previous.has(key) && isFloor(map, next)) {
        previous.set(key, current);
        queue.push(next);
      }
    });
  }
  if (!previous.has(targetKey)) return [];
  const path: TilePosition[] = [];
  let current: TilePosition | null = target;
  while (current) {
    path.push(current);
    current = previous.get(positionKey(current)) ?? null;
  }
  return path.reverse();
}

export function allFloorsReachable(map: ArenaMap): boolean {
  const reachable = findPath(map, map.start, map.start);
  if (reachable.length === 0) return false;
  const visited = new Set<string>([positionKey(map.start)]);
  const queue = [map.start];
  for (let index = 0; index < queue.length; index += 1) {
    neighbours(queue[index]).forEach((next) => {
      const key = positionKey(next);
      if (!visited.has(key) && isFloor(map, next)) {
        visited.add(key);
        queue.push(next);
      }
    });
  }
  return floorTiles(map).every(position => visited.has(positionKey(position)));
}

export function selectAmmoBoxTiles(
  map: ArenaMap,
  occupied: readonly TilePosition[] = [],
  count = AMMO_BOX_COUNT,
): TilePosition[] {
  const occupiedKeys = new Set<string>([positionKey(map.start), ...occupied.map(positionKey)]);
  return floorTiles(map)
    .filter(position => !occupiedKeys.has(positionKey(position)))
    .sort((left, right) => {
      const leftRank = mixSeed(map.seed, 'ammo-box:' + positionKey(left));
      const rightRank = mixSeed(map.seed, 'ammo-box:' + positionKey(right));
      return leftRank - rightRank || left.y - right.y || left.x - right.x;
    })
    .slice(0, Math.max(0, count));
}

export function selectSpawnTile(
  map: ArenaMap,
  request: SpawnRequest,
  seed: number,
): TilePosition | null {
  const occupied = new Set(request.occupied.map(positionKey));
  const candidates = floorTiles(map).filter(position => !occupied.has(positionKey(position)));
  if (candidates.length === 0) return null;
  const outside = candidates.filter(position => !inside(position, request.viewport));
  if (outside.length > 0) {
    const nearby = outside.filter(position => viewportGap(position, request.viewport) <= 6);
    const pool = nearby.length > 0 ? nearby : outside;
    return pool[(seed >>> 0) % pool.length];
  }
  return candidates.sort((left, right) => {
    const distance = manhattan(right, request.player) - manhattan(left, request.player);
    return distance || left.y - right.y || left.x - right.x;
  })[0];
}

export function respawnDelayFor(
  kind: ArenaEnemyKind,
  enemyId: string,
  respawnCount: number,
  seed: number,
): number {
  const [minimum, maximum] = kind === 'basic' ? [1300, 1900] : [900, 1500];
  const mixed = mixSeed(seed, `${enemyId}:${respawnCount}`);
  return minimum + (mixed % (maximum - minimum + 1));
}

function generateCandidate(seed: number, generationSeed: number, fallback: boolean): ArenaMap | null {
  const random = new SeededRandom(generationSeed);
  const roomCount = fallback ? 4 : 7;
  const rooms: Room[] = [];
  for (let roomIndex = 0; roomIndex < roomCount; roomIndex += 1) {
    const room = placeRoom(random, rooms, fallback, roomIndex);
    if (!room) return null;
    rooms.push(room);
  }
  const tiles = Array.from({ length: ARENA_HEIGHT_TILES }, () =>
    Array<Tile>(ARENA_WIDTH_TILES).fill('wall'),
  );
  rooms.forEach(room => carveRoom(tiles, room));
  const corridors: Corridor[] = [];
  for (let index = 1; index < rooms.length; index += 1) {
    const corridor: Corridor = {
      from: roomCenter(rooms[index - 1]),
      to: roomCenter(rooms[index]),
      width: fallback ? 2 : random.integer(1, 3),
      horizontalFirst: random.integer(0, 1) === 0,
    };
    corridors.push(corridor);
    carveCorridor(tiles, corridor);
  }
  const start = roomCenter(rooms[0]);
  const protectedTiles = new Set<string>([positionKey(start), ...corridors.flatMap(corridor => corridorTiles(corridor).map(positionKey))]);
  const obstacles = fallback ? [] : placeObstacles(tiles, rooms, protectedTiles, random);
  obstacles.forEach((position) => {
    tiles[position.y][position.x] = 'wall';
  });
  return {
    seed,
    width: ARENA_WIDTH_TILES,
    height: ARENA_HEIGHT_TILES,
    tileSize: TILE_SIZE,
    tiles,
    rooms,
    corridors,
    obstacles,
    start,
  };
}

function placeRoom(random: SeededRandom, rooms: readonly Room[], fallback: boolean, index: number): Room | null {
  if (fallback) {
    const columns = [2, 20];
    const rows = [3, 14];
    return { x: columns[index % 2], y: rows[Math.floor(index / 2)], width: 8, height: 6 };
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const width = random.integer(5, 9);
    const height = random.integer(4, 7);
    const room = {
      x: random.integer(1, ARENA_WIDTH_TILES - width - 2),
      y: random.integer(1, ARENA_HEIGHT_TILES - height - 2),
      width,
      height,
    };
    if (rooms.every(existing => !roomsTouchWithMargin(room, existing))) return room;
  }
  return null;
}

function roomsTouchWithMargin(left: Room, right: Room): boolean {
  return left.x - 1 <= right.x + right.width
    && left.x + left.width >= right.x - 1
    && left.y - 1 <= right.y + right.height
    && left.y + left.height >= right.y - 1;
}

function carveRoom(tiles: Tile[][], room: Room): void {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) tiles[y][x] = 'floor';
  }
}

function carveCorridor(tiles: Tile[][], corridor: Corridor): void {
  const corner = corridor.horizontalFirst
    ? { x: corridor.to.x, y: corridor.from.y }
    : { x: corridor.from.x, y: corridor.to.y };
  carveSegment(tiles, corridor.from, corner, corridor.width);
  carveSegment(tiles, corner, corridor.to, corridor.width);
}

function carveSegment(tiles: Tile[][], from: TilePosition, to: TilePosition, width: number): void {
  const horizontal = from.y === to.y;
  const radiusBefore = Math.floor((width - 1) / 2);
  const radiusAfter = width - 1 - radiusBefore;
  const start = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
  const end = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
  for (let main = start; main <= end; main += 1) {
    for (let offset = -radiusBefore; offset <= radiusAfter; offset += 1) {
      const x = horizontal ? main : from.x + offset;
      const y = horizontal ? from.y + offset : main;
      if (x > 0 && y > 0 && x < ARENA_WIDTH_TILES - 1 && y < ARENA_HEIGHT_TILES - 1) {
        tiles[y][x] = 'floor';
      }
    }
  }
}

function placeObstacles(
  tiles: Tile[][],
  rooms: readonly Room[],
  protectedTiles: Set<string>,
  random: SeededRandom,
): TilePosition[] {
  const obstacles: TilePosition[] = [];
  rooms.slice(1).forEach((room) => {
    if (random.integer(0, 1) === 0) return;
    const candidates: TilePosition[] = [];
    for (let y = room.y + 1; y < room.y + room.height - 1; y += 1) {
      for (let x = room.x + 1; x < room.x + room.width - 1; x += 1) {
        const position = { x, y };
        if (tiles[y][x] === 'floor' && !protectedTiles.has(positionKey(position))) candidates.push(position);
      }
    }
    if (candidates.length > 0) obstacles.push(candidates[random.integer(0, candidates.length - 1)]);
  });
  return obstacles;
}

function corridorTiles(corridor: Corridor): TilePosition[] {
  const points: TilePosition[] = [];
  const corner = corridor.horizontalFirst
    ? { x: corridor.to.x, y: corridor.from.y }
    : { x: corridor.from.x, y: corridor.to.y };
  [
    [corridor.from, corner],
    [corner, corridor.to],
  ].forEach(([from, to]) => {
    const horizontal = from.y === to.y;
    const start = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
    const end = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
    for (let value = start; value <= end; value += 1) {
      points.push(horizontal ? { x: value, y: from.y } : { x: from.x, y: value });
    }
  });
  return points;
}

function floorTiles(map: ArenaMap): TilePosition[] {
  const result: TilePosition[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (map.tiles[y][x] === 'floor') result.push({ x, y });
    }
  }
  return result;
}

function inBounds(map: ArenaMap, position: TilePosition): boolean {
  return position.x >= 0
    && position.y >= 0
    && position.x < map.width
    && position.y < map.height;
}

function supercoverLine(start: TilePosition, target: TilePosition): TilePosition[] {
  const tiles: TilePosition[] = [{ ...start }];
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const countX = Math.abs(dx);
  const countY = Math.abs(dy);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  let x = start.x;
  let y = start.y;
  let movedX = 0;
  let movedY = 0;
  while (movedX < countX || movedY < countY) {
    const decision = (1 + 2 * movedX) * countY - (1 + 2 * movedY) * countX;
    if (decision === 0) {
      // 中心線がcornerへ触れるとき、両側tileも遮蔽候補に含めて斜め抜けを防ぐ。
      tiles.push({ x: x + stepX, y });
      tiles.push({ x, y: y + stepY });
      x += stepX;
      y += stepY;
      movedX += 1;
      movedY += 1;
    } else if (decision < 0) {
      x += stepX;
      movedX += 1;
    } else {
      y += stepY;
      movedY += 1;
    }
    tiles.push({ x, y });
  }
  return tiles;
}

function roomCenter(room: Room): TilePosition {
  return { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
}

function neighbours(position: TilePosition): TilePosition[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];
}

function sameTileLayout(left: ArenaMap, right: ArenaMap): boolean {
  return left.tiles.every((row, y) => row.every((tile, x) => tile === right.tiles[y][x]));
}
function positionKey(position: TilePosition): string {
  return `${position.x},${position.y}`;
}

function inside(position: TilePosition, viewport: TileRect): boolean {
  return position.x >= viewport.left
    && position.x <= viewport.right
    && position.y >= viewport.top
    && position.y <= viewport.bottom;
}

function viewportGap(position: TilePosition, viewport: TileRect): number {
  const x = position.x < viewport.left ? viewport.left - position.x : position.x - viewport.right;
  const y = position.y < viewport.top ? viewport.top - position.y : position.y - viewport.bottom;
  return Math.max(x, y);
}

function manhattan(left: TilePosition, right: TilePosition): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function mixSeed(seed: number, value: string): number {
  let mixed = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    mixed = Math.imul(mixed ^ value.charCodeAt(index), 16_777_619) >>> 0;
  }
  return mixed;
}
