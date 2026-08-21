import type { ArenaTerrain, EnemyVisibility, Room, SpawnDirection, Tile, TilePosition } from '../arena-map';
import { DIRECTION_LABELS, ENEMY_IDS } from '../game-data';
import { PLAYER_ROLES, type PlayerRoleId } from '../player-data';
import type { SoundWaveTile } from '../runtime-acoustic-graph';
import type { RuntimeAreaNodeKind } from '../runtime-area-graph';
import { AMMO_MATERIAL_ORDER, AMMO_MATERIALS, STABLE_ENEMY_SLOT_COUNT, WEAPONS, activeEnemyCount, activeWeapon, currentRunPhase, currentWaveNumber, remainingEnemyCount, remainingPhaseMs, remainingWaveMs, type AmmoMaterial, type CombatState, type EnemyInstanceId, type InventorySlotRef, type RunState, type WeaponInstance } from '../rules';

export type EnemyHudView = {
  stableId: string;
  spawnPhase: string;
  primaryDirection: string;
  assignedDirection: string;
  spawnTile: string;
  spawnReason: string;
  active: boolean;
  recycleCount: number;
  visibility: EnemyVisibility;
  spriteTexture: string;
  spriteAlpha: number;
  spriteVisible: boolean;
  silhouetteTexture: string;
  silhouetteAlpha: number;
  silhouetteVisible: boolean;
};

export type MinimapMarker = {
  kind: 'enemy' | 'weapon' | 'ammo' | 'scrap';
  tile: TilePosition;
};

/** world mapと同じ伝播snapshotから描画するミニマップ用の一時音波。 */
export type MinimapSoundWave = {
  tiles: readonly SoundWaveTile[];
  color: string;
  alpha: number;
};

/** 音響debugでworldとminimapが共有する、graph単位の一時表示snapshot。 */
export type AcousticDebugView = {
  revision: number;
  rooms: readonly Room[];
  source: TilePosition | undefined;
  nodes: readonly {
    id: string;
    kind: RuntimeAreaNodeKind;
    tiles: readonly TilePosition[];
    center: { x: number; y: number };
    arrived: boolean;
    source: boolean;
    arrivalCost: number | undefined;
  }[];
  edges: readonly {
    from: { x: number; y: number };
    to: { x: number; y: number };
    predecessor: boolean;
    arrivalCost: number | undefined;
  }[];
};

export type MinimapView = {
  map: Pick<ArenaTerrain, 'width' | 'height' | 'tiles'>;
  observedTiles: ReadonlyMap<string, Tile>;
  visibleTileKeys: ReadonlySet<string>;
  terrainChanged: boolean;
  playerTile: TilePosition;
  markers: readonly MinimapMarker[];
  soundWaves: readonly MinimapSoundWave[];
  acousticDebug: AcousticDebugView | undefined;
};

export type ArenaHudView = {
  state: CombatState;
  runState: RunState;
  ammoBoxCount: number;
  activeAmmoBoxTiles: readonly string[];
  activeAmmoBoxEntries: readonly string[];
  activeWorldItemEntries: readonly string[];
  offscreenAmmoBoxIds: readonly string[];
  pendingAmmoBoxIds: readonly string[];
  pendingAmmoBoxOriginTiles: readonly string[];
  gunslingerCombo: number;
  gunslingerSpeedMultiplier: number;
  isGunslinger: boolean;
  reload: { active: boolean; progress: number };
  remainingSurvivalMs: number;
  spawnPhase: number;
  primaryDirection: SpawnDirection;
  mapSeed: number;
  playerTile: TilePosition;
};

/** 詳細インベントリから移動する武器のDOM上の行き先。 */
export type InventoryDropTarget = InventorySlotRef | 'world';

/** 詳細インベントリからworldまたは武器枠へ移す対象。 */
export type InventoryDragSource
  = | { kind: 'weapon'; slot: InventorySlotRef }
    | { kind: 'material'; material: AmmoMaterial };

function inventorySlotRefFromTarget(target: EventTarget | null): InventorySlotRef | undefined {
  if (!(target instanceof Element)) return undefined;
  const slot = target.closest<HTMLElement>('[data-inventory-container][data-index]');
  const container = slot?.dataset.inventoryContainer;
  const index = Number(slot?.dataset.index);
  if ((container !== 'quick' && container !== 'backpack') || !Number.isInteger(index)) return undefined;
  return { container, index };
}

function ammoMaterialFromTarget(target: EventTarget | null): AmmoMaterial | undefined {
  if (!(target instanceof Element)) return undefined;
  const material = target.closest<HTMLOutputElement>('[data-ammo-material]')?.dataset.ammoMaterial;
  return AMMO_MATERIAL_ORDER.includes(material as AmmoMaterial) ? material as AmmoMaterial : undefined;
}

function sameInventorySlot(left: InventorySlotRef, right: InventorySlotRef): boolean {
  return left.container === right.container && left.index === right.index;
}

function enemyRecord<T>(create: (id: EnemyInstanceId) => T): Record<EnemyInstanceId, T> {
  return Object.fromEntries(ENEMY_IDS.map(id => [id, create(id)])) as Record<EnemyInstanceId, T>;
}

function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value)
    throw new Error(`必要なHUD要素が見つかりません: ${selector}`);
  return value;
}

export function formatSurvivalTime(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

/** 未踏地形を隠す通常minimapとは別に、debug時だけcurrent graphの全体像を重ねる。 */
function drawAcousticDebugMinimap(
  context: CanvasRenderingContext2D,
  debug: AcousticDebugView,
  tileWidth: number,
  tileHeight: number,
): void {
  const colors: Record<RuntimeAreaNodeKind, string> = {
    area: '#74c8ff',
    junction: '#ffcf70',
    corridor: '#c79dff',
  };
  context.save();
  context.lineWidth = Math.max(1, Math.min(tileWidth, tileHeight) * 0.25);
  context.strokeStyle = '#f2c4ff';
  context.globalAlpha = 0.8;
  debug.rooms.forEach((room) => {
    context.strokeRect(room.x * tileWidth, room.y * tileHeight, room.width * tileWidth, room.height * tileHeight);
  });
  debug.nodes.forEach((node) => {
    context.fillStyle = colors[node.kind];
    context.globalAlpha = node.arrived ? 0.44 : 0.20;
    node.tiles.forEach((tile) => {
      context.fillRect(tile.x * tileWidth, tile.y * tileHeight, tileWidth, tileHeight);
    });
  });
  context.lineWidth = Math.max(1, Math.min(tileWidth, tileHeight) * 0.18);
  context.strokeStyle = '#bed2de';
  context.globalAlpha = 0.7;
  debug.edges.forEach((edge) => {
    context.beginPath();
    context.moveTo((edge.from.x + 0.5) * tileWidth, (edge.from.y + 0.5) * tileHeight);
    context.lineTo((edge.to.x + 0.5) * tileWidth, (edge.to.y + 0.5) * tileHeight);
    context.stroke();
  });
  const predecessorEdges = debug.edges
    .filter(edge => edge.predecessor)
    .sort((left, right) => (left.arrivalCost ?? Number.POSITIVE_INFINITY) - (right.arrivalCost ?? Number.POSITIVE_INFINITY));
  const maximumArrivalCost = predecessorEdges.at(-1)?.arrivalCost ?? 0;
  context.strokeStyle = '#fff18a';
  predecessorEdges.forEach((edge) => {
    context.globalAlpha = maximumArrivalCost > 0 && edge.arrivalCost !== undefined
      ? 0.45 + 0.55 * (1 - edge.arrivalCost / maximumArrivalCost)
      : 1;
    context.beginPath();
    context.moveTo((edge.from.x + 0.5) * tileWidth, (edge.from.y + 0.5) * tileHeight);
    context.lineTo((edge.to.x + 0.5) * tileWidth, (edge.to.y + 0.5) * tileHeight);
    context.stroke();
  });
  context.strokeStyle = '#ffffff';
  debug.nodes.forEach((node) => {
    if (!node.arrived)
      return;
    node.tiles.forEach((tile) => {
      context.strokeRect(tile.x * tileWidth, tile.y * tileHeight, tileWidth, tileHeight);
    });
  });
  if (debug.source) {
    context.fillStyle = '#ffffff';
    context.fillRect(
      debug.source.x * tileWidth + tileWidth * 0.2,
      debug.source.y * tileHeight + tileHeight * 0.2,
      tileWidth * 0.6,
      tileHeight * 0.6,
    );
  }
  context.restore();
}

export class ArenaHud {
  private readonly game = element<HTMLElement>('#game');
  private readonly minimap = element<HTMLCanvasElement>('[data-testid="minimap"]');
  private readonly minimapContext = this.minimap.getContext('2d');
  private readonly minimapTerrain = document.createElement('canvas');
  private readonly minimapTerrainContext = this.minimapTerrain.getContext('2d');
  private minimapTerrainInitialized = false;
  private readonly playerHp = element<HTMLOutputElement>('[data-testid="hp"]');
  private readonly playerHpBar = element<HTMLProgressElement>('[data-testid="hp-bar"]');
  private readonly weaponHud = element<HTMLOutputElement>('[data-testid="weapon"]');
  private readonly ammoHud = element<HTMLOutputElement>('[data-testid="ammo"]');
  private readonly ammoPanelWeaponHud = element<HTMLOutputElement>('[data-testid="ammo-panel-weapon"]');
  private readonly materialHud = element<HTMLOutputElement>('[data-testid="ammo-material"]');
  private readonly quickSlots = [
    element<HTMLOutputElement>('[data-testid="quick-slot-1"]'),
    element<HTMLOutputElement>('[data-testid="quick-slot-2"]'),
    element<HTMLOutputElement>('[data-testid="quick-slot-3"]'),
  ];

  private readonly inventoryDetail = element<HTMLElement>('[data-testid="inventory-detail"]');
  private readonly ammoPouch = element<HTMLElement>('[data-testid="ammo-pouch"]');
  private readonly ammoPouchEntries: ReadonlyArray<{ material: AmmoMaterial; output: HTMLOutputElement }> = AMMO_MATERIAL_ORDER.map(material => ({
    material,
    output: element<HTMLOutputElement>(`[data-testid="ammo-pouch-${material}"]`),
  }));

  private readonly inventoryDetailQuickSlots = [
    element<HTMLOutputElement>('[data-testid="inventory-quick-slot-1"]'),
    element<HTMLOutputElement>('[data-testid="inventory-quick-slot-2"]'),
    element<HTMLOutputElement>('[data-testid="inventory-quick-slot-3"]'),
  ];

  private readonly backpackSlots = Array.from({ length: 10 }, (_, index) =>
    element<HTMLOutputElement>(`[data-testid="backpack-slot-${index + 1}"]`));

  private readonly scrapHud = element<HTMLOutputElement>('[data-testid="scrap"]');
  private readonly worldItemCountHud = element<HTMLOutputElement>('[data-testid="world-item-count"]');
  private readonly ammoBoxCountHud = element<HTMLOutputElement>('[data-testid="ammo-box-count"]');
  private readonly playerRoleHud = element<HTMLOutputElement>('[data-testid="role"]');
  private readonly pickupPrompt = element<HTMLElement>('[data-testid="pickup-prompt"]');
  private readonly pickupTarget = element<HTMLElement>('[data-testid="pickup-target"]');
  private readonly pickupAction = element<HTMLElement>('[data-testid="pickup-action"]');
  private readonly reloadProgressLabel = element<HTMLElement>('[data-testid="reload-progress-label"]');
  private readonly reloadProgressHud = element<HTMLProgressElement>('[data-testid="reload-progress"]');
  private readonly reloadHud = element<HTMLOutputElement>('[data-testid="reload"]');
  private readonly mapSeedHud = element<HTMLOutputElement>('[data-testid="map-seed"]');
  private readonly playerTileHud = element<HTMLOutputElement>('[data-testid="player-tile"]');
  private readonly fps = element<HTMLOutputElement>('[data-testid="fps"]');
  public readonly playerHitVignette = element<HTMLElement>('#player-hit-vignette');
  private readonly survivalTimeHud = element<HTMLOutputElement>('[data-testid="survival-time"]');
  private readonly runPanel = element<HTMLElement>('[data-testid="run-panel"]');
  private readonly waveHud = element<HTMLOutputElement>('[data-testid="wave"]');
  private readonly waveRemainingHud = element<HTMLOutputElement>('[data-testid="wave-remaining"]');
  private readonly runPhaseHud = element<HTMLOutputElement>('[data-testid="run-phase"]');
  private readonly phaseRemainingHud = element<HTMLOutputElement>('[data-testid="phase-remaining"]');
  private readonly enemyCurrentHud = element<HTMLOutputElement>('[data-testid="enemy-current"]');
  private readonly enemyGoalHud = element<HTMLOutputElement>('[data-testid="enemy-goal"]');
  private readonly enemyRemainingHud = element<HTMLOutputElement>('[data-testid="enemy-remaining"]');
  private readonly killsHud = element<HTMLOutputElement>('[data-testid="kills"]');
  private readonly gunslingerComboPanel = element<HTMLElement>('[data-testid="gunslinger-combo-panel"]');
  private readonly gunslingerComboHud = element<HTMLOutputElement>('[data-testid="gunslinger-combo"]');
  private readonly spawnPhaseHud = element<HTMLOutputElement>('[data-testid="spawn-phase"]');
  private readonly primaryDirectionHud = element<HTMLOutputElement>('[data-testid="primary-direction"]');
  private readonly feedback = element<HTMLElement>('[data-testid="feedback"]');
  private readonly resultPanel = element<HTMLElement>('[data-testid="result"]');
  private readonly defeat = element<HTMLElement>('[data-testid="defeat"]');
  private readonly victory = element<HTMLElement>('[data-testid="victory"]');
  private readonly retry = element<HTMLButtonElement>('[data-testid="retry"]');
  private readonly enemyHp = enemyRecord(id => element<HTMLOutputElement>(`[data-testid="${id}-hp"]`));
  private inventoryDropListener: ((source: InventoryDragSource, target: InventoryDropTarget) => void) | undefined;
  private dragSource: InventoryDragSource | undefined;
  private inventoryDragMessage = false;

  private readonly onInventoryDragStart = (event: DragEvent): void => {
    if (!this.inventoryDropListener)
      return;
    const slot = inventorySlotRefFromTarget(event.target);
    const sourceSlot = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-inventory-container][data-index]')
      : undefined;
    if (slot && sourceSlot && this.inventoryDetail.contains(sourceSlot)) {
      if (sourceSlot.dataset.empty === 'true')
        return;
      this.dragSource = { kind: 'weapon', slot };
      this.inventoryDetail.dataset.dragSource = `${slot.container}:${slot.index}`;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `weapon:${slot.container}:${slot.index}`);
      }
      return;
    }
    const material = ammoMaterialFromTarget(event.target);
    if (!material || !(event.target instanceof Node) || !this.ammoPouch.contains(event.target))
      return;
    this.dragSource = { kind: 'material', material };
    this.ammoPouch.dataset.dragSource = `material:${material}`;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `material:${material}`);
    }
  };

  private readonly onInventoryDragEnd = (): void => this.clearInventoryDrag();

  private readonly onInventoryDragOver = (event: DragEvent): void => {
    const target = inventorySlotRefFromTarget(event.target);
    if (!this.dragSource || this.dragSource.kind !== 'weapon' || !target)
      return;
    event.preventDefault();
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = 'move';
    this.setInventoryDropTarget(target);
  };

  private readonly onInventoryDrop = (event: DragEvent): void => {
    const source = this.dragSource;
    const target = inventorySlotRefFromTarget(event.target);
    if (!source || source.kind !== 'weapon' || !target)
      return;
    event.preventDefault();
    this.inventoryDropListener?.(source, target);
    this.clearInventoryDrag();
  };

  private readonly onGameDragOver = (event: DragEvent): void => {
    if (!this.dragSource)
      return;
    event.preventDefault();
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = 'move';
    this.game.dataset.weaponDropTarget = 'true';
  };

  private readonly onGameDrop = (event: DragEvent): void => {
    const source = this.dragSource;
    if (!source)
      return;
    event.preventDefault();
    this.inventoryDropListener?.(source, 'world');
    this.clearInventoryDrag();
  };

  constructor(spawnConfig: string, runConfig: string) {
    this.spawnPhaseHud.dataset.spawnConfig = spawnConfig;
    this.runPanel.dataset.runConfig = runConfig;
    this.inventoryDetail.addEventListener('dragstart', this.onInventoryDragStart);
    this.inventoryDetail.addEventListener('dragend', this.onInventoryDragEnd);
    this.inventoryDetail.addEventListener('dragover', this.onInventoryDragOver);
    this.inventoryDetail.addEventListener('drop', this.onInventoryDrop);
    this.ammoPouch.addEventListener('dragstart', this.onInventoryDragStart);
    this.ammoPouch.addEventListener('dragend', this.onInventoryDragEnd);
    this.game.addEventListener('dragover', this.onGameDragOver);
    this.game.addEventListener('drop', this.onGameDrop);
  }

  public onRetry(listener: () => void): void {
    this.retry.addEventListener('click', listener);
  }

  /** Sceneごとに差し替える詳細インベントリのdrop処理を登録する。 */
  public setInventoryDropListener(listener: ((source: InventoryDragSource, target: InventoryDropTarget) => void) | undefined): void {
    this.inventoryDropListener = listener;
  }

  public setPlayerRole(roleId: PlayerRoleId): void {
    const role = PLAYER_ROLES.find(candidate => candidate.id === roleId);
    if (!role)
      return;
    this.playerRoleHud.value = `${role.label}（${role.color}）`;
    this.playerRoleHud.dataset.role = role.id;
    this.playerRoleHud.style.color = role.accent;
  }

  public setPickupPrompt(prompt: { target: string; action: string } | undefined): void {
    this.pickupPrompt.hidden = prompt === undefined;
    this.pickupTarget.textContent = prompt?.target ?? '';
    this.pickupAction.textContent = prompt?.action ?? '';
  }

  public setInventoryOpen(open: boolean): void {
    this.inventoryDetail.hidden = !open;
    this.inventoryDetail.dataset.open = String(open);
    this.ammoPouch.hidden = !open;
    this.ammoPouch.dataset.open = String(open);
    if (!open)
      this.clearInventoryDrag();
  }

  public updateFps(value: number): void {
    this.fps.value = String(value);
  }

  public setPlaying(): void {
    this.clearInventoryDrag(true);
    this.feedback.textContent = '-';
    this.resultPanel.hidden = true;
    this.resultPanel.dataset.state = 'playing';
    this.defeat.hidden = true;
    this.victory.hidden = true;
  }

  public showResult(result: 'defeat' | 'victory'): void {
    this.clearInventoryDrag(true);
    this.resultPanel.hidden = false;
    this.resultPanel.dataset.state = result;
    this.defeat.hidden = result !== 'defeat';
    this.victory.hidden = result !== 'victory';
    this.retry.focus();
  }

  public setFeedback(message: string): void {
    this.inventoryDragMessage = false;
    this.feedback.textContent = message;
  }

  /** worldへ置けないときだけ、次のrun境界で消す一時メッセージを表示する。 */
  public setInventoryDragMessage(message: string): void {
    this.feedback.textContent = message;
    this.inventoryDragMessage = true;
  }

  /** drag sourceとdrop強調を消し、run境界では一時メッセージも消す。 */
  public clearInventoryDrag(clearMessage = false): void {
    this.dragSource = undefined;
    delete this.inventoryDetail.dataset.dragSource;
    delete this.ammoPouch.dataset.dragSource;
    delete this.game.dataset.weaponDropTarget;
    this.inventoryDetail.querySelectorAll<HTMLElement>('[data-drop-target]').forEach((slot) => {
      delete slot.dataset.dropTarget;
    });
    if (clearMessage && this.inventoryDragMessage) {
      this.feedback.textContent = '-';
      this.inventoryDragMessage = false;
    }
  }

  public updateVisibilityMask(alpha: number, obscuredTileCount: number, playerTile: TilePosition): void {
    this.playerTileHud.dataset.visibilityMaskAlpha = String(alpha);
    this.playerTileHud.dataset.obscuredTileCount = String(obscuredTileCount);
    this.playerTileHud.dataset.visibilityPlayerTile = `${playerTile.x},${playerTile.y}`;
  }

  /** 現在視界と既知地形だけを小さなCanvasへ描画する。 */
  public updateMinimap(view: MinimapView): void {
    const context = this.minimapContext;
    const terrainContext = this.minimapTerrainContext;
    if (!context || !terrainContext)
      return;
    const width = this.minimap.width;
    const height = this.minimap.height;
    const tileWidth = width / view.map.width;
    const tileHeight = height / view.map.height;
    if (
      view.terrainChanged
      || !this.minimapTerrainInitialized
      || this.minimapTerrain.width !== width
      || this.minimapTerrain.height !== height
    ) {
      this.redrawMinimapTerrain(view, terrainContext, width, height, tileWidth, tileHeight);
      this.minimapTerrainInitialized = true;
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(this.minimapTerrain, 0, 0);
    context.save();
    view.soundWaves.forEach((wave) => {
      context.fillStyle = wave.color;
      wave.tiles.forEach((entry) => {
        if (!view.observedTiles.has(`${entry.tile.x},${entry.tile.y}`))
          return;
        context.globalAlpha = wave.alpha * entry.alpha;
        context.fillRect(
          entry.tile.x * tileWidth + Math.max(1, tileWidth * 0.14),
          entry.tile.y * tileHeight + Math.max(1, tileHeight * 0.14),
          Math.max(2, tileWidth * 0.72),
          Math.max(2, tileHeight * 0.72),
        );
      });
    });
    context.restore();
    if (view.acousticDebug)
      drawAcousticDebugMinimap(context, view.acousticDebug, tileWidth, tileHeight);
    view.markers.forEach((marker) => {
      const color = marker.kind === 'enemy'
        ? '#ff6b6b'
        : marker.kind === 'weapon'
          ? '#8fd8ff'
          : marker.kind === 'ammo'
            ? '#ffe17a'
            : '#c6b4ff';
      context.fillStyle = color;
      context.fillRect(
        marker.tile.x * tileWidth + Math.max(1, tileWidth * 0.2),
        marker.tile.y * tileHeight + Math.max(1, tileHeight * 0.2),
        Math.max(2, tileWidth * 0.6),
        Math.max(2, tileHeight * 0.6),
      );
    });
    context.fillStyle = '#ffffff';
    context.fillRect(
      view.playerTile.x * tileWidth + Math.max(1, tileWidth * 0.15),
      view.playerTile.y * tileHeight + Math.max(1, tileHeight * 0.15),
      Math.max(2, tileWidth * 0.7),
      Math.max(2, tileHeight * 0.7),
    );
    this.minimap.dataset.width = String(view.map.width);
    this.minimap.dataset.height = String(view.map.height);
    this.minimap.dataset.observedTiles = String(view.observedTiles.size);
    this.minimap.dataset.visibleTiles = String(view.visibleTileKeys.size);
    this.minimap.dataset.playerTile = `${view.playerTile.x},${view.playerTile.y}`;
    this.minimap.dataset.visibleMarkers = view.markers
      .map(marker => `${marker.kind}:${marker.tile.x},${marker.tile.y}`)
      .join('|');
  }

  private redrawMinimapTerrain(
    view: MinimapView,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    tileWidth: number,
    tileHeight: number,
  ): void {
    this.minimapTerrain.width = width;
    this.minimapTerrain.height = height;
    const drawTile = (key: string, tile: Tile, floor: string, wall: string): void => {
      const [x, y] = key.split(',').map(Number);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= view.map.width || y >= view.map.height)
        return;
      context.fillStyle = tile === 'wall' ? wall : floor;
      context.fillRect(x * tileWidth, y * tileHeight, Math.ceil(tileWidth), Math.ceil(tileHeight));
    };
    context.fillStyle = '#07111e';
    context.fillRect(0, 0, width, height);
    view.observedTiles.forEach((tile, key) => drawTile(key, tile, '#193148', '#3b5164'));
    view.visibleTileKeys.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      const tile = Number.isInteger(x) && Number.isInteger(y) ? view.map.tiles[y]?.[x] : undefined;
      if (tile)
        drawTile(key, tile, '#3b7690', '#8aa8bd');
    });
  }

  public updateEnemy(id: EnemyInstanceId, view: EnemyHudView): void {
    const hud = this.enemyHp[id];
    hud.dataset.stableId = view.stableId;
    hud.dataset.spawnPhase = view.spawnPhase;
    hud.dataset.primaryDirection = view.primaryDirection;
    hud.dataset.assignedDirection = view.assignedDirection;
    hud.dataset.spawnTile = view.spawnTile;
    hud.dataset.spawnReason = view.spawnReason;
    hud.dataset.active = String(view.active);
    hud.dataset.recycleCount = String(view.recycleCount);
    hud.dataset.visibility = view.visibility;
    hud.dataset.spriteTexture = view.spriteTexture;
    hud.dataset.spriteAlpha = String(view.spriteAlpha);
    hud.dataset.spriteVisible = String(view.spriteVisible);
    hud.dataset.silhouetteTexture = view.silhouetteTexture;
    hud.dataset.silhouetteAlpha = String(view.silhouetteAlpha);
    hud.dataset.silhouetteVisible = String(view.silhouetteVisible);
  }

  public refresh(view: ArenaHudView): void {
    this.playerHp.value = String(view.state.playerHp);
    this.playerHpBar.value = view.state.playerHp;
    ENEMY_IDS.forEach((id) => {
      this.enemyHp[id].value = String(view.state.enemies[id].hp);
    });
    const selectedWeapon = view.state.inventory.quickSlots[view.state.inventory.selectedQuickSlot];
    const weapon = activeWeapon(view.state);
    const selectedLabel = selectedWeapon ? WEAPONS[selectedWeapon.model].label : '武器なし';
    this.weaponHud.value = selectedLabel;
    this.ammoPanelWeaponHud.value = selectedLabel;
    if (weapon) {
      const definition = WEAPONS[weapon.model];
      const material = AMMO_MATERIALS[definition.material];
      const quantity = view.state.inventory.materials[definition.material];
      this.ammoHud.value = weapon.magazine + '/' + definition.magazineSize;
      this.materialHud.value = `素材 ${material.label} ${quantity}`;
      this.ammoHud.dataset.magazine = String(weapon.magazine);
      this.ammoHud.dataset.magazineCapacity = String(definition.magazineSize);
      this.materialHud.dataset.material = definition.material;
      this.materialHud.dataset.quantity = String(quantity);
    } else {
      this.ammoHud.value = '-/-';
      this.materialHud.value = '素材 -';
      this.ammoHud.dataset.magazine = '';
      this.ammoHud.dataset.magazineCapacity = '';
      this.materialHud.dataset.material = '';
      this.materialHud.dataset.quantity = '';
    }
    this.updateInventory(view.state);
    this.updateAmmoPouch(view.state);
    this.worldItemCountHud.value = String(view.activeWorldItemEntries.length);
    this.worldItemCountHud.dataset.worldItems = view.activeWorldItemEntries.join('|');
    this.ammoBoxCountHud.value = String(view.ammoBoxCount);
    this.ammoBoxCountHud.dataset.activeTiles = view.activeAmmoBoxTiles.join('|');
    this.ammoBoxCountHud.dataset.activeBoxes = view.activeAmmoBoxEntries.join('|');
    this.ammoBoxCountHud.dataset.offscreenBoxes = view.offscreenAmmoBoxIds.join('|');
    this.ammoBoxCountHud.dataset.respawnBoxes = view.pendingAmmoBoxIds.join('|');
    this.ammoBoxCountHud.dataset.respawnTiles = view.pendingAmmoBoxOriginTiles.join('|');
    this.updateGunslinger(view.gunslingerCombo, view.gunslingerSpeedMultiplier, view.isGunslinger);
    this.reloadHud.value = view.state.reloading === null
      ? '待機'
      : weapon?.id === view.state.reloading
        ? `リロード中: ${WEAPONS[weapon.model].label}`
        : 'リロード中';
    this.updateReloadProgress(view.reload);
    this.updateSurvival(view.remainingSurvivalMs);
    this.updateRun(view.runState);
    this.updateSpawnPhase(view.spawnPhase, view.primaryDirection);
    this.mapSeedHud.value = String(view.mapSeed);
    this.updateTile(view.playerTile);
  }

  private updateInventory(state: CombatState): void {
    state.inventory.quickSlots.forEach((weapon, index) => {
      const selected = state.inventory.selectedQuickSlot === index;
      const quickSlot = this.quickSlots[index];
      if (quickSlot)
        this.updateWeaponSlot(quickSlot, weapon, index, selected);
      const inventoryDetailQuickSlot = this.inventoryDetailQuickSlots[index];
      if (inventoryDetailQuickSlot)
        this.updateWeaponSlot(inventoryDetailQuickSlot, weapon, index, selected, 'quick');
    });
    state.inventory.backpackSlots.forEach((weapon, index) => {
      const slot = this.backpackSlots[index];
      if (!slot)
        return;
      const label = weapon ? WEAPONS[weapon.model].label : '空き';
      slot.value = `${index + 1} ${label}`;
      slot.dataset.index = String(index);
      slot.dataset.model = weapon?.model ?? '';
      slot.dataset.weaponInstance = weapon?.id ?? '';
      slot.dataset.magazine = weapon ? String(weapon.magazine) : '';
      delete slot.dataset.weapon;
      slot.dataset.empty = String(weapon === null);
      slot.dataset.inventoryContainer = 'backpack';
      slot.draggable = weapon !== null;
    });
    this.inventoryDetail.dataset.selectedQuickSlot = String(state.inventory.selectedQuickSlot);
    this.scrapHud.value = `スクラップ ${state.inventory.materials.scrap}`;
    this.scrapHud.dataset.count = String(state.inventory.materials.scrap);
  }

  /** 弾薬ポーチは3素材の所持数とworld drop情報を一覧表示する。 */
  private updateAmmoPouch(state: CombatState): void {
    this.ammoPouchEntries.forEach(({ material, output }) => {
      const ammo = AMMO_MATERIALS[material];
      output.value = `${ammo.icon} ${ammo.label} ${state.inventory.materials[material]}`;
      output.dataset.ammoMaterial = material;
      output.dataset.material = material;
      output.dataset.quantity = String(state.inventory.materials[material]);
      output.dataset.boxQuantity = String(ammo.boxQuantity);
      output.dataset.worldColor = ammo.worldColor;
      output.dataset.dragKind = 'material';
      delete output.dataset.ammoType;
      delete output.dataset.weapon;
      delete output.dataset.reserve;
      output.draggable = true;
    });
  }

  private updateWeaponSlot(
    slot: HTMLOutputElement,
    weapon: WeaponInstance | null,
    index: number,
    selected: boolean,
    inventoryContainer?: InventorySlotRef['container'],
  ): void {
    const label = weapon ? WEAPONS[weapon.model].label : '空き';
    slot.value = `${index + 1} ${label}${selected ? '（選択中）' : ''}`;
    slot.dataset.index = String(index);
    slot.dataset.model = weapon?.model ?? '';
    slot.dataset.weaponInstance = weapon?.id ?? '';
    slot.dataset.magazine = weapon ? String(weapon.magazine) : '';
    delete slot.dataset.weapon;
    slot.dataset.empty = String(weapon === null);
    slot.dataset.selected = String(selected);
    if (inventoryContainer) {
      slot.dataset.inventoryContainer = inventoryContainer;
      slot.draggable = weapon !== null;
    } else {
      delete slot.dataset.inventoryContainer;
      slot.draggable = false;
    }
  }

  private setInventoryDropTarget(target: InventorySlotRef): void {
    this.inventoryDetail.querySelectorAll<HTMLElement>('[data-drop-target]').forEach((slot) => {
      delete slot.dataset.dropTarget;
    });
    const selector = `[data-inventory-container="${target.container}"][data-index="${target.index}"]`;
    const slot = this.inventoryDetail.querySelector<HTMLElement>(selector);
    if (slot && this.dragSource?.kind === 'weapon' && !sameInventorySlot(this.dragSource.slot, target))
      slot.dataset.dropTarget = 'true';
  }

  public updateReloadProgress(reload: { active: boolean; progress: number }): void {
    this.reloadProgressLabel.hidden = !reload.active;
    this.reloadProgressHud.hidden = !reload.active;
    if (!reload.active) {
      this.reloadProgressHud.value = 0;
      this.reloadProgressHud.removeAttribute('aria-valuetext');
      return;
    }
    this.reloadProgressHud.value = reload.progress;
    this.reloadProgressHud.setAttribute('aria-valuetext', String(Math.round(reload.progress * 100)) + '%');
  }

  public updateSurvival(remainingMs: number): void {
    this.survivalTimeHud.value = formatSurvivalTime(remainingMs);
  }

  public updateRun(state: RunState): void {
    const phase = currentRunPhase(state);
    this.waveHud.value = String(currentWaveNumber(state));
    this.waveHud.dataset.state = state.status;
    this.waveRemainingHud.value = formatSurvivalTime(remainingWaveMs(state));
    this.runPanel.dataset.phase = phase;
    this.runPhaseHud.value = phase === 'combat'
      ? '夜（戦闘）'
      : phase === 'preparation'
        ? '昼（準備）'
        : '昼（休憩）';
    this.runPhaseHud.dataset.phase = phase;
    this.phaseRemainingHud.value = formatSurvivalTime(remainingPhaseMs(state));
    this.enemyCurrentHud.value = String(activeEnemyCount(state));
    this.enemyGoalHud.value = String(STABLE_ENEMY_SLOT_COUNT);
    this.enemyRemainingHud.value = String(remainingEnemyCount(state));
    this.killsHud.value = String(state.kills);
  }

  public updateGunslinger(combo: number, speedMultiplier: number, isGunslinger: boolean): void {
    this.gunslingerComboPanel.hidden = !isGunslinger;
    this.gunslingerComboHud.value = String(combo);
    this.gunslingerComboHud.dataset.active = String(isGunslinger);
    this.gunslingerComboHud.dataset.speedMultiplier = String(speedMultiplier);
  }

  public updateSpawnPhase(phase: number, primaryDirection: SpawnDirection): void {
    this.spawnPhaseHud.value = String(phase + 1);
    this.spawnPhaseHud.dataset.phase = String(phase);
    this.primaryDirectionHud.value = DIRECTION_LABELS[primaryDirection];
    this.primaryDirectionHud.dataset.direction = primaryDirection;
  }

  public updateTile(tile: TilePosition): void {
    this.playerTileHud.value = `${tile.x},${tile.y}`;
  }
}
