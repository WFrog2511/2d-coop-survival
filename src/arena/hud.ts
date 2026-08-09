import type { EnemyVisibility, SpawnDirection, TilePosition } from '../arena-map';
import { DIRECTION_LABELS, ENEMY_IDS } from '../game-data';
import { WEAPONS, type CombatState, type EnemyInstanceId } from '../rules';

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
  ammoBoxCount: number;
  activeAmmoBoxTiles: readonly string[];
  activeAmmoBoxEntries: readonly string[];
  offscreenAmmoBoxIds: readonly string[];
  pendingAmmoBoxIds: readonly string[];
  pendingAmmoBoxOriginTiles: readonly string[];
  reload: { active: boolean; progress: number };
  remainingSurvivalMs: number;
  spawnPhase: number;
  primaryDirection: SpawnDirection;
  mapSeed: number;
  playerTile: TilePosition;
};

function enemyRecord<T>(create: (id: EnemyInstanceId) => T): Record<EnemyInstanceId, T> {
  return Object.fromEntries(ENEMY_IDS.map(id => [id, create(id)])) as Record<EnemyInstanceId, T>;
}

function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value)
    throw new Error(`必要なHUD要素が見つかりません: ${selector}`);
  return value;
}

function formatSurvivalTime(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

export class ArenaHud {
  private readonly playerHp = element<HTMLOutputElement>('[data-testid="hp"]');
  private readonly playerHpBar = element<HTMLProgressElement>('[data-testid="hp-bar"]');
  private readonly weaponHud = element<HTMLOutputElement>('[data-testid="weapon"]');
  private readonly ammoHud = element<HTMLOutputElement>('[data-testid="ammo"]');
  private readonly ammoPanelWeaponHud = element<HTMLOutputElement>('[data-testid="ammo-panel-weapon"]');
  private readonly reserveHud = element<HTMLOutputElement>('[data-testid="ammo-reserve"]');
  private readonly ammoBoxCountHud = element<HTMLOutputElement>('[data-testid="ammo-box-count"]');
  private readonly reloadProgressLabel = element<HTMLElement>('[data-testid="reload-progress-label"]');
  private readonly reloadProgressHud = element<HTMLProgressElement>('[data-testid="reload-progress"]');
  private readonly reloadHud = element<HTMLOutputElement>('[data-testid="reload"]');
  private readonly mapSeedHud = element<HTMLOutputElement>('[data-testid="map-seed"]');
  private readonly playerTileHud = element<HTMLOutputElement>('[data-testid="player-tile"]');
  private readonly fps = element<HTMLOutputElement>('[data-testid="fps"]');
  public readonly playerHitVignette = element<HTMLElement>('#player-hit-vignette');
  private readonly survivalTimeHud = element<HTMLOutputElement>('[data-testid="survival-time"]');
  private readonly spawnPhaseHud = element<HTMLOutputElement>('[data-testid="spawn-phase"]');
  private readonly primaryDirectionHud = element<HTMLOutputElement>('[data-testid="primary-direction"]');
  private readonly feedback = element<HTMLElement>('[data-testid="feedback"]');
  private readonly resultPanel = element<HTMLElement>('[data-testid="result"]');
  private readonly defeat = element<HTMLElement>('[data-testid="defeat"]');
  private readonly victory = element<HTMLElement>('[data-testid="victory"]');
  private readonly retry = element<HTMLButtonElement>('[data-testid="retry"]');
  private readonly enemyHp = enemyRecord(id => element<HTMLOutputElement>(`[data-testid="${id}-hp"]`));

  constructor(spawnConfig: string) {
    this.spawnPhaseHud.dataset.spawnConfig = spawnConfig;
  }

  public onRetry(listener: () => void): void {
    this.retry.addEventListener('click', listener);
  }

  public updateFps(value: number): void {
    this.fps.value = String(value);
  }

  public setPlaying(): void {
    this.feedback.textContent = '-';
    this.resultPanel.hidden = true;
    this.resultPanel.dataset.state = 'playing';
    this.defeat.hidden = true;
    this.victory.hidden = true;
  }

  public showResult(result: 'defeat' | 'victory'): void {
    this.resultPanel.hidden = false;
    this.resultPanel.dataset.state = result;
    this.defeat.hidden = result !== 'defeat';
    this.victory.hidden = result !== 'victory';
    this.retry.focus();
  }

  public setFeedback(message: string): void {
    this.feedback.textContent = message;
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
    this.weaponHud.value = WEAPONS[view.state.weapon].label;
    const weapon = WEAPONS[view.state.weapon];
    this.ammoPanelWeaponHud.value = weapon.label;
    this.ammoHud.value = view.state.ammo[view.state.weapon] + '/' + weapon.magazineSize;
    this.reserveHud.value = '予備 ' + view.state.reserve[view.state.weapon] + '/' + weapon.reserveMax;
    this.ammoHud.dataset.magazine = String(view.state.ammo[view.state.weapon]);
    this.ammoHud.dataset.magazineCapacity = String(weapon.magazineSize);
    this.reserveHud.dataset.reserve = String(view.state.reserve[view.state.weapon]);
    this.reserveHud.dataset.reserveCapacity = String(weapon.reserveMax);
    this.ammoBoxCountHud.value = String(view.ammoBoxCount);
    this.ammoBoxCountHud.dataset.activeTiles = view.activeAmmoBoxTiles.join('|');
    this.ammoBoxCountHud.dataset.activeBoxes = view.activeAmmoBoxEntries.join('|');
    this.ammoBoxCountHud.dataset.offscreenBoxes = view.offscreenAmmoBoxIds.join('|');
    this.ammoBoxCountHud.dataset.respawnBoxes = view.pendingAmmoBoxIds.join('|');
    this.ammoBoxCountHud.dataset.respawnTiles = view.pendingAmmoBoxOriginTiles.join('|');
    this.reloadHud.value = view.state.reloading === null ? '待機' : `リロード中: ${WEAPONS[view.state.reloading].label}`;
    this.updateReloadProgress(view.reload);
    this.updateSurvival(view.remainingSurvivalMs);
    this.updateSpawnPhase(view.spawnPhase, view.primaryDirection);
    this.mapSeedHud.value = String(view.mapSeed);
    this.updateTile(view.playerTile);
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
