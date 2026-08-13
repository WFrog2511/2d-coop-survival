import type { EnemyVisibility, SpawnDirection, TilePosition } from '../arena-map';
import { DIRECTION_LABELS, ENEMY_IDS } from '../game-data';
import { PLAYER_ROLES, type PlayerRoleId } from '../player-data';
import { AMMO_TYPES, AMMO_TYPE_ORDER, STABLE_ENEMY_SLOT_COUNT, WEAPON_MODELS, WEAPONS, activeEnemyCount, activeWeaponId, currentRunPhase, currentWaveNumber, remainingEnemyCount, remainingPhaseMs, remainingWaveMs, weaponIdForModel, type AmmoType, type CombatState, type EnemyInstanceId, type InventorySlotRef, type RunState, type WeaponModel } from '../rules';

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

function inventorySlotRefFromTarget(target: EventTarget | null): InventorySlotRef | undefined {
  if (!(target instanceof Element)) return undefined;
  const slot = target.closest<HTMLElement>('[data-inventory-container][data-index]');
  const container = slot?.dataset.inventoryContainer;
  const index = Number(slot?.dataset.index);
  if ((container !== 'quick' && container !== 'backpack') || !Number.isInteger(index)) return undefined;
  return { container, index };
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

export class ArenaHud {
  private readonly game = element<HTMLElement>('#game');
  private readonly playerHp = element<HTMLOutputElement>('[data-testid="hp"]');
  private readonly playerHpBar = element<HTMLProgressElement>('[data-testid="hp-bar"]');
  private readonly weaponHud = element<HTMLOutputElement>('[data-testid="weapon"]');
  private readonly ammoHud = element<HTMLOutputElement>('[data-testid="ammo"]');
  private readonly ammoPanelWeaponHud = element<HTMLOutputElement>('[data-testid="ammo-panel-weapon"]');
  private readonly reserveHud = element<HTMLOutputElement>('[data-testid="ammo-reserve"]');
  private readonly quickSlots = [
    element<HTMLOutputElement>('[data-testid="quick-slot-1"]'),
    element<HTMLOutputElement>('[data-testid="quick-slot-2"]'),
    element<HTMLOutputElement>('[data-testid="quick-slot-3"]'),
  ];

  private readonly inventoryDetail = element<HTMLElement>('[data-testid="inventory-detail"]');
  private readonly ammoPouch = element<HTMLElement>('[data-testid="ammo-pouch"]');
  private readonly ammoPouchEntries: ReadonlyArray<{ type: AmmoType; output: HTMLOutputElement }> = AMMO_TYPE_ORDER.map(type => ({
    type,
    output: element<HTMLOutputElement>(`[data-testid="ammo-pouch-${type}"]`),
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
  private inventoryDropListener: ((source: InventorySlotRef, target: InventoryDropTarget) => void) | undefined;
  private dragSource: InventorySlotRef | undefined;
  private inventoryDragMessage = false;

  private readonly onInventoryDragStart = (event: DragEvent): void => {
    const source = inventorySlotRefFromTarget(event.target);
    if (!source || !this.inventoryDropListener || !this.inventoryDetail.contains(event.target as Node))
      return;
    const sourceSlot = (event.target as Element).closest<HTMLElement>('[data-inventory-container][data-index]');
    if (sourceSlot?.dataset.empty === 'true')
      return;
    this.dragSource = source;
    this.inventoryDetail.dataset.dragSource = `${source.container}:${source.index}`;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${source.container}:${source.index}`);
    }
  };

  private readonly onInventoryDragEnd = (): void => this.clearInventoryDrag();

  private readonly onInventoryDragOver = (event: DragEvent): void => {
    const target = inventorySlotRefFromTarget(event.target);
    if (!this.dragSource || !target)
      return;
    event.preventDefault();
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = 'move';
    this.setInventoryDropTarget(target);
  };

  private readonly onInventoryDrop = (event: DragEvent): void => {
    const source = this.dragSource;
    const target = inventorySlotRefFromTarget(event.target);
    if (!source || !target)
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
    this.game.addEventListener('dragover', this.onGameDragOver);
    this.game.addEventListener('drop', this.onGameDrop);
  }

  public onRetry(listener: () => void): void {
    this.retry.addEventListener('click', listener);
  }

  /** Sceneごとに差し替える詳細インベントリのdrop処理を登録する。 */
  public setInventoryDropListener(listener: ((source: InventorySlotRef, target: InventoryDropTarget) => void) | undefined): void {
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
    const selectedModel = view.state.inventory.quickSlots[view.state.inventory.selectedQuickSlot];
    const weaponId = activeWeaponId(view.state);
    const selectedLabel = selectedModel ? WEAPON_MODELS[selectedModel].label : '武器なし';
    this.weaponHud.value = selectedLabel;
    this.ammoPanelWeaponHud.value = selectedLabel;
    if (weaponId) {
      const weapon = WEAPONS[weaponId];
      this.ammoHud.value = view.state.ammo[weaponId] + '/' + weapon.magazineSize;
      this.reserveHud.value = '予備 ' + view.state.reserve[weaponId] + '/' + weapon.reserveMax;
      this.ammoHud.dataset.magazine = String(view.state.ammo[weaponId]);
      this.ammoHud.dataset.magazineCapacity = String(weapon.magazineSize);
      this.reserveHud.dataset.reserve = String(view.state.reserve[weaponId]);
      this.reserveHud.dataset.reserveCapacity = String(weapon.reserveMax);
    } else {
      this.ammoHud.value = '-/-';
      this.reserveHud.value = '予備 -/-';
      this.ammoHud.dataset.magazine = '';
      this.ammoHud.dataset.magazineCapacity = '';
      this.reserveHud.dataset.reserve = '';
      this.reserveHud.dataset.reserveCapacity = '';
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
    this.reloadHud.value = view.state.reloading === null ? '待機' : `リロード中: ${WEAPONS[view.state.reloading].label}`;
    this.updateReloadProgress(view.reload);
    this.updateSurvival(view.remainingSurvivalMs);
    this.updateRun(view.runState);
    this.updateSpawnPhase(view.spawnPhase, view.primaryDirection);
    this.mapSeedHud.value = String(view.mapSeed);
    this.updateTile(view.playerTile);
  }

  private updateInventory(state: CombatState): void {
    state.inventory.quickSlots.forEach((model, index) => {
      const selected = state.inventory.selectedQuickSlot === index;
      const quickSlot = this.quickSlots[index];
      if (quickSlot)
        this.updateWeaponSlot(quickSlot, model, index, selected);
      const inventoryDetailQuickSlot = this.inventoryDetailQuickSlots[index];
      if (inventoryDetailQuickSlot)
        this.updateWeaponSlot(inventoryDetailQuickSlot, model, index, selected, 'quick');
    });
    state.inventory.backpackSlots.forEach((model, index) => {
      const slot = this.backpackSlots[index];
      if (!slot)
        return;
      const label = model ? WEAPON_MODELS[model].label : '空き';
      slot.value = `${index + 1} ${label}`;
      slot.dataset.index = String(index);
      slot.dataset.model = model ?? '';
      slot.dataset.weapon = model ? weaponIdForModel(model) : '';
      slot.dataset.empty = String(model === null);
      slot.dataset.inventoryContainer = 'backpack';
      slot.draggable = model !== null;
    });
    this.inventoryDetail.dataset.selectedQuickSlot = String(state.inventory.selectedQuickSlot);
    this.scrapHud.value = `スクラップ ${state.inventory.materials.scrap}`;
    this.scrapHud.dataset.count = String(state.inventory.materials.scrap);
  }

  /** 弾薬ポーチは既存の武器種ごとの予備弾薬だけを一覧表示する。 */
  private updateAmmoPouch(state: CombatState): void {
    this.ammoPouchEntries.forEach(({ type, output }) => {
      const ammo = AMMO_TYPES[type];
      output.value = `${ammo.icon} ${ammo.label} ${state.reserve[ammo.weapon]}`;
      output.dataset.ammoType = type;
      output.dataset.weapon = ammo.weapon;
      output.dataset.reserve = String(state.reserve[ammo.weapon]);
    });
  }

  private updateWeaponSlot(
    slot: HTMLOutputElement,
    model: WeaponModel | null,
    index: number,
    selected: boolean,
    inventoryContainer?: InventorySlotRef['container'],
  ): void {
    const label = model ? WEAPON_MODELS[model].label : '空き';
    slot.value = `${index + 1} ${label}${selected ? '（選択中）' : ''}`;
    slot.dataset.index = String(index);
    slot.dataset.model = model ?? '';
    slot.dataset.weapon = model ? weaponIdForModel(model) : '';
    slot.dataset.empty = String(model === null);
    slot.dataset.selected = String(selected);
    if (inventoryContainer) {
      slot.dataset.inventoryContainer = inventoryContainer;
      slot.draggable = model !== null;
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
    if (slot && this.dragSource && !sameInventorySlot(this.dragSource, target))
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
