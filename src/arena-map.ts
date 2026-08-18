export const TILE_SIZE = 40;
export const ARENA_WIDTH_TILES = 113;
export const ARENA_HEIGHT_TILES = 71;
export const CENTRAL_RESERVE_SIZE_TILES = 13;
export const AMMO_BOX_COUNT = 4;
export const SPAWN_PHASE_MS = 60_000;
export const WORLD_WEAPON_DROP_MAX_PATH_DISTANCE = 2;
export const SPAWN_DIRECTIONS = ['up', 'right', 'down', 'left'] as const;

const NORMAL_ROOM_COUNT = 14;
const NORMAL_ROOM_WIDTH = { minimum: 8, maximum: 12 };
const NORMAL_ROOM_HEIGHT = { minimum: 6, maximum: 10 };
const NORMAL_ROOM_PLACEMENT_ATTEMPTS = 80;
const FALLBACK_ROOM_COUNT = 8;
const FALLBACK_ROOM_WIDTH = 12;
const FALLBACK_ROOM_HEIGHT = 10;

/** アリーナを構成する壁または床のtile種別。 */
export type Tile = 'wall' | 'floor';

/** 敵spawnを割り当てる四方向。 */
export type SpawnDirection = (typeof SPAWN_DIRECTIONS)[number];

/** tile座標を表す整数位置。 */
export type TilePosition = { x: number; y: number };

/** tile単位の表示領域を表す境界矩形。 */
export type TileRect = { left: number; top: number; right: number; bottom: number };

/** 生成された部屋の左上位置と大きさ。 */
export type Room = { x: number; y: number; width: number; height: number };

/** 二つの部屋を結ぶ直交通路の定義。 */
export type Corridor = { from: TilePosition; to: TilePosition; width: number; horizontalFirst: boolean };

/** 中央に確保する将来用の予約領域と、その周囲の安定した接近候補。 */
export type CentralReserve = {
  bounds: TileRect;
  approaches: Record<SpawnDirection, TilePosition>;
};

/** spawn遅延計算に使う敵種別。 */
export type ArenaEnemyKind = 'basic' | 'drone';

/** プレイヤーから見た敵の表示状態。 */
export type EnemyVisibility = 'normal' | 'boundary' | 'hidden';

/** 生成済みアリーナの地形、開始位置、再現用seed。 */
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
  centralReserve?: CentralReserve;
};

/** 通常のspawn候補を選ぶためのプレイヤー、表示領域、占有位置。 */
export type SpawnRequest = {
  player: TilePosition;
  viewport: TileRect;
  occupied: readonly TilePosition[];
  direction?: SpawnDirection;
};

/** 敵spawnで必須にする方向を含む候補条件。 */
export type EnemySpawnRequest = Omit<SpawnRequest, 'direction'> & {
  direction: SpawnDirection;
};

/** 基本敵がプレイヤーへ接近するときの役割。 */
export type BasicApproachRole = 'direct' | 'left' | 'right';

export const ARENA_CENTER: TilePosition = {
  x: Math.floor(ARENA_WIDTH_TILES / 2),
  y: Math.floor(ARENA_HEIGHT_TILES / 2),
};

export const CENTRAL_RESERVE_BOUNDS: TileRect = {
  left: ARENA_CENTER.x - Math.floor(CENTRAL_RESERVE_SIZE_TILES / 2),
  top: ARENA_CENTER.y - Math.floor(CENTRAL_RESERVE_SIZE_TILES / 2),
  right: ARENA_CENTER.x + Math.floor(CENTRAL_RESERVE_SIZE_TILES / 2),
  bottom: ARENA_CENTER.y + Math.floor(CENTRAL_RESERVE_SIZE_TILES / 2),
};

export const CENTRAL_RESERVE_APPROACHES: Record<SpawnDirection, TilePosition> = {
  up: { x: ARENA_CENTER.x, y: CENTRAL_RESERVE_BOUNDS.top - 1 },
  right: { x: CENTRAL_RESERVE_BOUNDS.right + 1, y: ARENA_CENTER.y },
  down: { x: ARENA_CENTER.x, y: CENTRAL_RESERVE_BOUNDS.bottom + 1 },
  left: { x: CENTRAL_RESERVE_BOUNDS.left - 1, y: ARENA_CENTER.y },
};

/**
 * 経過時間から現在のspawn phase番号を求める。
 *
 * @param startedAt ランを開始した時刻。
 * @param now 現在時刻。
 * @returns 0始まりのspawn phase番号。
 */
export function spawnPhaseAt(startedAt: number, now: number): number {
  return Math.floor(Math.max(0, now - startedAt) / SPAWN_PHASE_MS);
}

/**
 * seedとphaseから主spawn方向を決定する。
 *
 * @param seed アリーナ生成に使うseed。
 * @param phase 0始まりのspawn phase番号。
 * @returns 四方向のうち選ばれた主方向。
 */
export function primarySpawnDirection(seed: number, phase: number): SpawnDirection {
  return SPAWN_DIRECTIONS[((seed >>> 0) + Math.max(0, Math.floor(phase))) % SPAWN_DIRECTIONS.length];
}

/**
 * 安定した敵枠へ主方向または反対方向を割り当てる。
 *
 * @param primary 主spawn方向。
 * @param stableSlot 0始まりの安定した敵枠番号。
 * @returns 割り当てられたspawn方向。
 */
export function spawnDirectionForSlot(primary: SpawnDirection, stableSlot: number): SpawnDirection {
  if (Math.max(0, Math.floor(stableSlot)) % 4 !== 3) return primary;
  return SPAWN_DIRECTIONS[(SPAWN_DIRECTIONS.indexOf(primary) + 2) % SPAWN_DIRECTIONS.length];
}

/**
 * world座標の表示範囲をtile境界へ変換する。
 *
 * @param view world座標で表した表示範囲。
 * @param map 変換に使うアリーナ寸法とtileサイズ。
 * @returns アリーナ内へ丸めたtile境界。
 */
export function viewportTileRect(
  view: { left: number; top: number; right: number; bottom: number },
  map: Pick<ArenaMap, 'width' | 'height' | 'tileSize'> = {
    width: ARENA_WIDTH_TILES,
    height: ARENA_HEIGHT_TILES,
    tileSize: TILE_SIZE,
  },
): TileRect {
  return {
    left: Math.max(0, Math.floor(view.left / map.tileSize)),
    top: Math.max(0, Math.floor(view.top / map.tileSize)),
    right: Math.max(0, Math.min(map.width - 1, Math.ceil(view.right / map.tileSize) - 1)),
    bottom: Math.max(0, Math.min(map.height - 1, Math.ceil(view.bottom / map.tileSize) - 1)),
  };
}

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

/**
 * 次の疑似乱数seedを決定的に生成する。
 *
 * @param seed 現在のseed。
 * @returns unsigned 32-bit整数へ正規化した次のseed。
 */
export function nextSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 1_664_525) + 1_013_904_223) >>> 0;
}

/**
 * 到達可能な通常地形またはfallback地形を生成する。
 *
 * @param seed 生成を再現する初期seed。
 * @returns 到達可能性を満たすアリーナ地形。
 */
export function generateArenaMap(seed: number): ArenaMap {
  let candidateSeed = seed >>> 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const map = generateCandidate(seed >>> 0, candidateSeed, false);
    if (map && allFloorsReachable(map)) return map;
    candidateSeed = nextSeed(candidateSeed);
  }
  return generateFallbackArenaMap(seed);
}

/**
 * 通常生成の再試行上限に達したときの連結済み地形を返す。
 *
 * @param seed 生成を再現する初期seed。
 * @returns fallback配置で生成した到達可能なアリーナ地形。
 */
export function generateFallbackArenaMap(seed: number): ArenaMap {
  const map = generateCandidate(seed >>> 0, seed >>> 0, true);
  if (!map || !allFloorsReachable(map)) throw new Error('fallbackアリーナを生成できません。');
  return map;
}

/**
 * 現在の地形と異なる次のアリーナ地形を生成する。
 *
 * @param current 現在表示しているアリーナ地形。
 * @returns tile配置が異なる次のアリーナ地形。
 */
export function generateNextArenaMap(current: ArenaMap): ArenaMap {
  let seed = nextSeed(current.seed);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = generateArenaMap(seed);
    if (!sameTileLayout(current, candidate)) return candidate;
    seed = nextSeed(seed);
  }
  throw new Error('異なるアリーナを生成できません。');
}

/**
 * 指定位置がアリーナ内の床tileかを判定する。
 *
 * @param map 判定対象のアリーナ地形。
 * @param position 判定するtile座標。
 * @returns 範囲内の床tileなら真。
 */
export function isFloor(map: ArenaMap, position: TilePosition): boolean {
  return position.x >= 0
    && position.y >= 0
    && position.x < map.width
    && position.y < map.height
    && map.tiles[position.y][position.x] === 'floor';
}

/**
 * プレイヤーから対象tileへの見通しを、cornerを含む全通過tileで判定する。
 *
 * @param map 判定対象のアリーナ地形。
 * @param player 見通しの起点となるプレイヤー位置。
 * @param target 見通しを判定する対象位置。
 * @returns 壁に遮られない見通しがあれば真。
 */
export function hasLineOfSight(
  map: ArenaMap,
  player: TilePosition,
  target: TilePosition,
): boolean {
  if (!isFloor(map, player) || !inBounds(map, target)) return false;
  const line = supercoverLine(player, target);
  return line.every((position, index) => index === line.length - 1 || map.tiles[position.y][position.x] !== 'wall');
}

/**
 * 敵floorの通常表示、壁際の共通silhouette、非表示を純粋に決める。
 *
 * @param map 判定対象のアリーナ地形。
 * @param player 視認するプレイヤー位置。
 * @param enemy 表示を判定する敵位置。
 * @returns 敵に適用する表示状態。
 */
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

/**
 * 床tileだけを通る最短経路を幅優先探索で求める。
 *
 * @param map 探索対象のアリーナ地形。
 * @param start 経路の始点。
 * @param target 経路の終点。
 * @param tieBreakSeed 同距離候補の順序を決める任意seed。
 * @returns 始点から終点までのtile列。到達不能なら空配列。
 */
export function findPath(
  map: ArenaMap,
  start: TilePosition,
  target: TilePosition,
  tieBreakSeed?: number,
): TilePosition[] {
  if (!isFloor(map, start) || !isFloor(map, target)) return [];
  const startKey = positionKey(start);
  const targetKey = positionKey(target);
  const queue = [start];
  const previous = new Map<string, TilePosition | null>([[startKey, null]]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (positionKey(current) === targetKey) break;
    orderedPathNeighbours(current, tieBreakSeed).forEach((next) => {
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

/**
 * すべての床tileが開始位置から到達可能かを判定する。
 *
 * @param map 判定対象のアリーナ地形。
 * @returns 全床tileが到達可能なら真。
 */
export function allFloorsReachable(map: ArenaMap): boolean {
  const distances = pathDistances(map, map.start);
  return distances.size > 0 && floorTiles(map).every(position => distances.has(positionKey(position)));
}

/**
 * 弾薬箱を置く3x3取得範囲が重ならない床tileを決定的に選ぶ。
 *
 * @param map 選択対象のアリーナ地形。
 * @param occupied すでに使用中として、その3x3取得範囲を除外するtile座標。
 * @param count 選択する弾薬箱の数。
 * @returns seed順で選んだ、3x3取得範囲が重ならない弾薬箱のtile座標。
 */
export function selectAmmoBoxTiles(
  map: ArenaMap,
  occupied: readonly TilePosition[] = [],
  count = AMMO_BOX_COUNT,
): TilePosition[] {
  const excluded = [map.start, ...occupied];
  const ordered = floorTiles(map)
    .filter(position => !excluded.some(other =>
      Math.abs(other.x - position.x) <= 1 && Math.abs(other.y - position.y) <= 1))
    .sort((left, right) => {
      const leftRank = mixSeed(map.seed, 'ammo-box:' + positionKey(left));
      const rightRank = mixSeed(map.seed, 'ammo-box:' + positionKey(right));
      return leftRank - rightRank || left.y - right.y || left.x - right.x;
    });
  const selected: TilePosition[] = [];
  for (const candidate of ordered) {
    const overlapsPickupRange = selected.some(tile =>
      Math.abs(tile.x - candidate.x) <= 1 && Math.abs(tile.y - candidate.y) <= 1);
    if (!overlapsPickupRange)
      selected.push(candidate);
  }
  return selected.slice(0, Math.max(0, count));
}

/**
 * 開始位置から到達できる初期武器pickupのtile群を決定的に選ぶ。
 *
 * @param map 選択対象のアリーナ地形。
 * @param occupied 弾薬箱など、同一または近傍を避けるtile座標。
 * @param count 選択するpickup数。
 * @returns 3x3取得範囲が重ならない到達可能tile群。
 */
export function selectInitialWeaponPickupTiles(
  map: ArenaMap,
  occupied: readonly TilePosition[] = [],
  count = 1,
): TilePosition[] {
  const excluded = [map.start, ...occupied];
  const occupiedKeys = new Set(excluded.map(positionKey));
  const distances = pathDistances(map, map.start);
  const candidates = floorTiles(map).flatMap((position) => {
    const distance = distances.get(positionKey(position));
    const nearOccupied = excluded.some(other => Math.abs(other.x - position.x) <= 1 && Math.abs(other.y - position.y) <= 1);
    return distance === undefined || distance === 0 || occupiedKeys.has(positionKey(position)) || nearOccupied
      ? []
      : [{ position, distance }];
  });
  const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const compareCandidates = (left: { position: TilePosition; distance: number }, right: { position: TilePosition; distance: number }): number => {
    const rank = mixSeed(map.seed, 'initial-weapon:' + positionKey(left.position))
      - mixSeed(map.seed, 'initial-weapon:' + positionKey(right.position));
    return rank || left.position.y - right.position.y || left.position.x - right.position.x;
  };
  const ordered = candidates.sort(compareCandidates);
  const selected: TilePosition[] = [];
  for (const candidate of ordered) {
    const overlapsPickupRange = selected.some(tile =>
      Math.abs(tile.x - candidate.position.x) <= 1
      && Math.abs(tile.y - candidate.position.y) <= 1,
    );
    if (overlapsPickupRange)
      continue;
    selected.push(candidate.position);
    if (selected.length === normalizedCount)
      break;
  }
  return selected;
}

/**
 * 開始位置から到達できる全floorから初期武器pickupのtileを決定的に選ぶ。
 *
 * @param map 選択対象のアリーナ地形。
 * @param occupied 弾薬箱など、同一または近傍を避けるtile座標。
 * @returns 選択したtile座標。候補がなければnull。
 */
export function selectInitialWeaponPickupTile(
  map: ArenaMap,
  occupied: readonly TilePosition[] = [],
): TilePosition | null {
  return selectInitialWeaponPickupTiles(map, occupied, 1)[0] ?? null;
}

/**
 * プレイヤー近傍へworld weaponを置ける、もっとも近い決定的なfloor tileを選ぶ。
 *
 * @param map 選択対象のアリーナ地形。
 * @param player 配置元プレイヤーの現在tile。
 * @param occupied active world item、弾薬箱、敵など配置不可のtile。
 * @returns 道なり距離上限内の候補。候補がなければnull。
 */
export function selectWorldWeaponDropTile(
  map: ArenaMap,
  player: TilePosition,
  occupied: readonly TilePosition[] = [],
): TilePosition | null {
  const occupiedKeys = new Set(occupied.map(positionKey));
  const distances = pathDistances(map, player);
  const candidates = floorTiles(map).flatMap((position) => {
    const distance = distances.get(positionKey(position));
    return distance === undefined
      || distance > WORLD_WEAPON_DROP_MAX_PATH_DISTANCE
      || occupiedKeys.has(positionKey(position))
      ? []
      : [{ position, distance }];
  });
  candidates.sort((left, right) => {
    const distance = left.distance - right.distance;
    if (distance !== 0) return distance;
    const rank = mixSeed(map.seed, 'world-weapon-drop:' + positionKey(left.position))
      - mixSeed(map.seed, 'world-weapon-drop:' + positionKey(right.position));
    if (rank !== 0) return rank;
    return left.position.y - right.position.y || left.position.x - right.position.x;
  });
  return candidates[0]?.position ?? null;
}

/**
 * 表示範囲外を優先して通常のspawn tileを選ぶ。
 *
 * @param map 選択対象のアリーナ地形。
 * @param request プレイヤー、表示範囲、占有位置の条件。
 * @param seed 候補から一つを選ぶ決定用seed。
 * @returns 選択したtile座標。候補がなければnull。
 */
export function selectSpawnTile(
  map: ArenaMap,
  request: SpawnRequest,
  seed: number,
): TilePosition | null {
  const occupied = new Set(request.occupied.map(positionKey));
  const distances = pathDistances(map, request.player);
  const candidates = floorTiles(map).filter(position =>
    !occupied.has(positionKey(position)) && distances.has(positionKey(position)),
  );
  if (candidates.length === 0) return null;
  const outside = candidates.filter(position => !inside(position, request.viewport));
  if (outside.length > 0) {
    const directed = request.direction
      ? outside.filter(position => directionFrom(request.player, position) === request.direction)
      : outside;
    const directionalPool = directed.length > 0 ? directed : outside;
    const nearby = directionalPool.filter(position => viewportGap(position, request.viewport) <= 6);
    const pool = nearby.length > 0 ? nearby : directionalPool;
    return pool[(seed >>> 0) % pool.length];
  }
  return candidates.sort((left, right) => {
    const distance = manhattan(right, request.player) - manhattan(left, request.player);
    return distance || left.y - right.y || left.x - right.x;
  })[0];
}

/**
 * 敵だけが使う、可視位置へfallbackしない厳格なspawn選択。
 *
 * @param map 選択対象のアリーナ地形。
 * @param request 敵spawnの必須方向を含む候補条件。
 * @param seed 候補poolから一つを選ぶ決定用seed。
 * @param candidatePoolSize 近距離候補として比較する最大数。
 * @returns 選択した非可視tile座標。候補がなければnull。
 */
export function selectEnemySpawnTile(
  map: ArenaMap,
  request: EnemySpawnRequest,
  seed: number,
  candidatePoolSize = 10,
): TilePosition | null {
  const occupied = new Set(request.occupied.map(positionKey));
  const distances = pathDistances(map, request.player);
  const lineOfSightByTile = new Map<string, boolean>();
  const hasCachedLineOfSight = (position: TilePosition): boolean => {
    const key = positionKey(position);
    const cached = lineOfSightByTile.get(key);
    if (cached !== undefined) return cached;
    const visible = hasLineOfSight(map, request.player, position);
    lineOfSightByTile.set(key, visible);
    return visible;
  };
  const candidates = floorTiles(map)
    .filter(position =>
      !occupied.has(positionKey(position))
      && !inside(position, request.viewport)
      && directionFrom(request.player, position) === request.direction
      && !hasCachedLineOfSight(position)
      && !neighbours(position).some(hasCachedLineOfSight),
    )
    .flatMap((position) => {
      const distance = distances.get(positionKey(position));
      return distance === undefined ? [] : [{ position, distance }];
    })
    .sort((left, right) => left.distance - right.distance || left.position.y - right.position.y || left.position.x - right.position.x);
  if (candidates.length === 0) return null;
  const poolSize = Number.isFinite(candidatePoolSize)
    ? Math.max(1, Math.floor(candidatePoolSize))
    : 10;
  const pool = candidates.slice(0, Math.min(poolSize, candidates.length));
  return pool[(seed >>> 0) % pool.length].position;
}

/**
 * 撃破後の敵再出現遅延を決定的に求める。
 *
 * @param kind 再出現する敵種別。
 * @param enemyId 安定した敵識別子。
 * @param respawnCount その敵の再出現回数。
 * @param seed アリーナ生成に使うseed。
 * @returns 敵種別と回数に対応する遅延ミリ秒。
 */
export function respawnDelayFor(
  kind: ArenaEnemyKind,
  enemyId: string,
  respawnCount: number,
  seed: number,
): number {
  const [minimum, maximum] = kind === 'basic' ? [5000, 9000] : [3000, 6000];
  return deterministicRange(seed, `death:${enemyId}:${respawnCount}`, minimum, maximum);
}

/**
 * 非表示の敵を再配置するまでの閾値を決定的に求める。
 *
 * @param enemyId 安定した敵識別子。
 * @param recycleCount その敵の再配置回数。
 * @param seed アリーナ生成に使うseed。
 * @returns 非表示時間の閾値ミリ秒。
 */
export function hiddenRecycleThresholdFor(enemyId: string, recycleCount: number, seed: number): number {
  return deterministicRange(seed, `hidden:${enemyId}:${recycleCount}`, 8000, 12000);
}

/**
 * 非表示の敵を再配置する待機時間を決定的に求める。
 *
 * @param enemyId 安定した敵識別子。
 * @param recycleCount その敵の再配置回数。
 * @param seed アリーナ生成に使うseed。
 * @returns 再配置を開始するまでの遅延ミリ秒。
 */
export function recycleDelayFor(enemyId: string, recycleCount: number, seed: number): number {
  return deterministicRange(seed, `recycle:${enemyId}:${recycleCount}`, 2000, 4000);
}

/**
 * 基本敵の安定枠から接近役割を決める。
 *
 * @param enemyId 判定する敵識別子。
 * @returns 基本敵の接近役割。対象外の識別子ならnull。
 */
export function basicApproachRoleFor(enemyId: string): BasicApproachRole | null {
  const match = /^basic-([1-9])$/.exec(enemyId);
  if (!match) return null;
  const stableNumber = Number(match[1]);
  if (stableNumber <= 3) return 'direct';
  return stableNumber <= 6 ? 'left' : 'right';
}

function generateCandidate(seed: number, generationSeed: number, fallback: boolean): ArenaMap | null {
  const random = new SeededRandom(generationSeed);
  const centralReserve = createCentralReserve();
  const roomCount = fallback ? FALLBACK_ROOM_COUNT : NORMAL_ROOM_COUNT;
  const rooms: Room[] = [];
  for (let roomIndex = 0; roomIndex < roomCount; roomIndex += 1) {
    const room = placeRoom(random, rooms, fallback, roomIndex, centralReserve.bounds);
    if (!room) return null;
    rooms.push(room);
  }
  const tiles = Array.from({ length: ARENA_HEIGHT_TILES }, () =>
    Array<Tile>(ARENA_WIDTH_TILES).fill('wall'),
  );
  rooms.forEach(room => carveRoom(tiles, room, centralReserve.bounds));
  const corridors = fallback
    ? fallbackCorridors(rooms)
    : rooms.slice(1).map((room, index) => ({
        from: roomCenter(rooms[index]),
        to: roomCenter(room),
        width: random.integer(1, 3),
        horizontalFirst: random.integer(0, 1) === 0,
      }));
  corridors.forEach(corridor => carveCorridor(tiles, corridor, centralReserve.bounds));
  carveReserveApproachRing(tiles, centralReserve.bounds);
  fillReserveWithWalls(tiles, centralReserve.bounds);
  const start = roomCenter(rooms[0]);
  const protectedTiles = new Set<string>([
    positionKey(start),
    ...centralReserveRingTiles(centralReserve.bounds).map(positionKey),
    ...corridors.flatMap(corridor => corridorTiles(corridor).map(positionKey)),
  ]);
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
    centralReserve,
  };
}

function placeRoom(
  random: SeededRandom,
  rooms: readonly Room[],
  fallback: boolean,
  index: number,
  centralReserve: TileRect,
): Room | null {
  if (fallback) return fallbackRoomAt(index, centralReserve);
  if (index === 0) return centralStartRoom(centralReserve);
  for (let attempt = 0; attempt < NORMAL_ROOM_PLACEMENT_ATTEMPTS; attempt += 1) {
    const width = random.integer(NORMAL_ROOM_WIDTH.minimum, NORMAL_ROOM_WIDTH.maximum);
    const height = random.integer(NORMAL_ROOM_HEIGHT.minimum, NORMAL_ROOM_HEIGHT.maximum);
    const room = {
      x: random.integer(1, ARENA_WIDTH_TILES - width - 2),
      y: random.integer(1, ARENA_HEIGHT_TILES - height - 2),
      width,
      height,
    };
    if (roomOverlapsTileRect(room, centralReserve)) continue;
    if (rooms.every(existing => !roomsTouchWithMargin(room, existing))) return room;
  }
  return null;
}

function centralStartRoom(centralReserve: TileRect): Room {
  return {
    x: centralReserve.left - FALLBACK_ROOM_WIDTH,
    y: ARENA_CENTER.y - Math.floor(FALLBACK_ROOM_HEIGHT / 2),
    width: FALLBACK_ROOM_WIDTH,
    height: FALLBACK_ROOM_HEIGHT,
  };
}

function fallbackRoomAt(index: number, centralReserve: TileRect): Room {
  const centralX = ARENA_CENTER.x - Math.floor(FALLBACK_ROOM_WIDTH / 2);
  const centralY = ARENA_CENTER.y - Math.floor(FALLBACK_ROOM_HEIGHT / 2);
  const topY = centralReserve.top - FALLBACK_ROOM_HEIGHT - 6;
  const bottomY = centralReserve.bottom + 7;
  const leftX = centralReserve.left - FALLBACK_ROOM_WIDTH * 2 - 11;
  const rightX = centralReserve.right + FALLBACK_ROOM_WIDTH + 12;
  const rooms = [
    centralStartRoom(centralReserve),
    { x: centralX, y: topY, width: FALLBACK_ROOM_WIDTH, height: FALLBACK_ROOM_HEIGHT },
    { x: centralReserve.right + 2, y: centralY, width: FALLBACK_ROOM_WIDTH, height: FALLBACK_ROOM_HEIGHT },
    { x: centralX, y: bottomY, width: FALLBACK_ROOM_WIDTH, height: FALLBACK_ROOM_HEIGHT },
    { x: leftX, y: topY, width: FALLBACK_ROOM_WIDTH, height: FALLBACK_ROOM_HEIGHT },
    { x: rightX, y: topY, width: FALLBACK_ROOM_WIDTH, height: FALLBACK_ROOM_HEIGHT },
    { x: leftX, y: bottomY, width: FALLBACK_ROOM_WIDTH, height: FALLBACK_ROOM_HEIGHT },
    { x: rightX, y: bottomY, width: FALLBACK_ROOM_WIDTH, height: FALLBACK_ROOM_HEIGHT },
  ];
  const room = rooms[index];
  if (!room || roomOverlapsTileRect(room, centralReserve))
    throw new Error('fallback部屋の配置が不正です。');
  return room;
}

function fallbackCorridors(rooms: readonly Room[]): Corridor[] {
  const connections = [
    [0, 1, false],
    [1, 2, true],
    [0, 3, false],
    [1, 4, true],
    [1, 5, true],
    [3, 6, true],
    [3, 7, true],
  ] as const;
  return connections.map(([fromIndex, toIndex, horizontalFirst]) => ({
    from: roomCenter(rooms[fromIndex]),
    to: roomCenter(rooms[toIndex]),
    width: 2,
    horizontalFirst,
  }));
}

function createCentralReserve(): CentralReserve {
  return {
    bounds: { ...CENTRAL_RESERVE_BOUNDS },
    approaches: {
      up: { ...CENTRAL_RESERVE_APPROACHES.up },
      right: { ...CENTRAL_RESERVE_APPROACHES.right },
      down: { ...CENTRAL_RESERVE_APPROACHES.down },
      left: { ...CENTRAL_RESERVE_APPROACHES.left },
    },
  };
}

function roomOverlapsTileRect(room: Room, bounds: TileRect): boolean {
  return room.x <= bounds.right
    && room.x + room.width - 1 >= bounds.left
    && room.y <= bounds.bottom
    && room.y + room.height - 1 >= bounds.top;
}

function insideTileRect(position: TilePosition, bounds: TileRect): boolean {
  return position.x >= bounds.left
    && position.x <= bounds.right
    && position.y >= bounds.top
    && position.y <= bounds.bottom;
}

function centralReserveRingTiles(bounds: TileRect): TilePosition[] {
  const tiles: TilePosition[] = [];
  for (let x = bounds.left - 1; x <= bounds.right + 1; x += 1) {
    tiles.push({ x, y: bounds.top - 1 });
    tiles.push({ x, y: bounds.bottom + 1 });
  }
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    tiles.push({ x: bounds.left - 1, y });
    tiles.push({ x: bounds.right + 1, y });
  }
  return tiles;
}

/**
 * 予約領域の外周を既存BFSが通れる四方向の接近リングとして残す。
 *
 * @param tiles 更新対象のアリーナtile配列。
 * @param bounds 中央予約領域のtile境界。
 */
function carveReserveApproachRing(tiles: Tile[][], bounds: TileRect): void {
  const mapHeight = tiles.length;
  const mapWidth = tiles[0]?.length ?? 0;
  centralReserveRingTiles(bounds).forEach((position) => {
    if (position.x > 0 && position.y > 0 && position.x < mapWidth - 1 && position.y < mapHeight - 1)
      tiles[position.y][position.x] = 'floor';
  });
}

function fillReserveWithWalls(tiles: Tile[][], bounds: TileRect): void {
  for (let y = bounds.top; y <= bounds.bottom; y += 1)
    for (let x = bounds.left; x <= bounds.right; x += 1)
      tiles[y][x] = 'wall';
}

function roomsTouchWithMargin(left: Room, right: Room): boolean {
  return left.x - 1 <= right.x + right.width
    && left.x + left.width >= right.x - 1
    && left.y - 1 <= right.y + right.height
    && left.y + left.height >= right.y - 1;
}

function carveRoom(tiles: Tile[][], room: Room, centralReserve: TileRect): void {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1)
      if (!insideTileRect({ x, y }, centralReserve))
        tiles[y][x] = 'floor';
  }
}

function carveCorridor(tiles: Tile[][], corridor: Corridor, centralReserve: TileRect): void {
  const corner = corridor.horizontalFirst
    ? { x: corridor.to.x, y: corridor.from.y }
    : { x: corridor.from.x, y: corridor.to.y };
  carveSegment(tiles, corridor.from, corner, corridor.width, centralReserve);
  carveSegment(tiles, corner, corridor.to, corridor.width, centralReserve);
}

function carveSegment(
  tiles: Tile[][],
  from: TilePosition,
  to: TilePosition,
  width: number,
  centralReserve: TileRect,
): void {
  const horizontal = from.y === to.y;
  const radiusBefore = Math.floor((width - 1) / 2);
  const radiusAfter = width - 1 - radiusBefore;
  const start = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
  const end = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
  const mapHeight = tiles.length;
  const mapWidth = tiles[0]?.length ?? 0;
  for (let main = start; main <= end; main += 1) {
    for (let offset = -radiusBefore; offset <= radiusAfter; offset += 1) {
      const x = horizontal ? main : from.x + offset;
      const y = horizontal ? from.y + offset : main;
      if (x > 0 && y > 0 && x < mapWidth - 1 && y < mapHeight - 1 && !insideTileRect({ x, y }, centralReserve)) {
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

function pathDistances(map: ArenaMap, start: TilePosition): Map<string, number> {
  if (!isFloor(map, start)) return new Map();
  const distances = new Map<string, number>([[positionKey(start), 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(positionKey(current));
    if (distance === undefined) continue;
    neighbours(current).forEach((next) => {
      const key = positionKey(next);
      if (!distances.has(key) && isFloor(map, next)) {
        distances.set(key, distance + 1);
        queue.push(next);
      }
    });
  }
  return distances;
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

/**
 * seed省略時は従来の4近傍順をそのまま返す。
 *
 * @param position 隣接tileを求める基準位置。
 * @param tieBreakSeed 同距離候補の順序を変える任意seed。
 * @returns 探索順に並べた隣接tile。
 */
function orderedPathNeighbours(position: TilePosition, tieBreakSeed?: number): TilePosition[] {
  const adjacent = neighbours(position);
  if (tieBreakSeed === undefined) return adjacent;
  return adjacent
    .map((next, index) => ({ next, index, rank: mixSeed(tieBreakSeed, `${positionKey(position)}>${positionKey(next)}`) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(entry => entry.next);
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

function directionFrom(player: TilePosition, target: TilePosition): SpawnDirection {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function mixSeed(seed: number, value: string): number {
  let mixed = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    mixed = Math.imul(mixed ^ value.charCodeAt(index), 16_777_619) >>> 0;
  }
  return mixed;
}

function deterministicRange(seed: number, key: string, minimum: number, maximum: number): number {
  return minimum + (mixSeed(seed, key) % (maximum - minimum + 1));
}
