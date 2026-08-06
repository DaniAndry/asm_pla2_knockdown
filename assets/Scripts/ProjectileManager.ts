import {
    _decorator,
    Component,
    Node,
    Vec3,
    Label,
    Prefab,
    instantiate,
    RigidBody,
    Collider,
    Animation,
    isValid,
    MeshRenderer,
} from 'cc';
import { CannonController } from './CannonController';
import { LevelManager } from './LevelManager';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('ProjectileManager')
export class ProjectileManager extends Component {
    @property({ type: Prefab, tooltip: 'Префаб снаряда (переиспользуется)' })
    projectilePrefab: Prefab = null;

    @property({ type: Node, tooltip: 'Точка спавна (если пусто — дуло пушки)' })
    projectileSpawnPoint: Node = null;

    @property(Node)
    projectileCountLabel: Node = null;

    @property({ type: [Node], tooltip: 'Визуальные индикаторы (бомбы). Показываются по maxProjectiles уровня' })
    visualIndicators: Node[] = [];

    @property({ tooltip: 'Через сколько секунд после выстрела снаряд исчезает' })
    projectileLifetime: number = 1;

    @property({ tooltip: 'Если за это время не было хита — считаем промах' })
    missCheckDelay: number = 0.5;

    @property({ tooltip: 'Имя звука промаха в SoundManager' })
    missSoundName: string = 'tac';

    private cannon: CannonController = null;
    private activeProjectile: Node | null = null;
    private inFlight: Node[] = [];
    private pool: Node[] = [];

    private maxProjectiles: number = 0;
    private usedCount: number = 0;

    onLoad() {
        this.cannon = this.getComponent(CannonController);
        if (!this.cannon || !this.projectilePrefab) {
            console.warn('[ProjectileManager] Нужны CannonController и projectilePrefab');
            return;
        }

        this.cannon.node.on('projectile-launched', this.onProjectileLaunched, this);

        if (this.node.scene) {
            this.node.scene.on('level-switched', this.onLevelSwitched, this);
            this.node.scene.on('level-projectiles-ready', this.onLevelProjectilesReady, this);
        }

        this.resetForLevel(this.resolveMaxProjectiles());
    }

    onDestroy() {
        if (this.cannon && this.cannon.node) {
            this.cannon.node.off('projectile-launched', this.onProjectileLaunched, this);
        }
        if (this.node.scene) {
            this.node.scene.off('level-switched', this.onLevelSwitched, this);
            this.node.scene.off('level-projectiles-ready', this.onLevelProjectilesReady, this);
        }
        this.clearAllProjectiles(true);
    }

    private resolveMaxProjectiles(): number {
        const scene = this.node.scene;
        if (!scene) return 0;

        const managers = scene.getComponentsInChildren(LevelManager);
        for (const manager of managers) {
            if (isValid(manager) && manager.node.activeInHierarchy) {
                return Math.max(0, manager.maxProjectiles);
            }
        }
        return 0;
    }

    private onLevelProjectilesReady(data: { max: number }) {
        if (data && typeof data.max === 'number') {
            this.resetForLevel(data.max);
            if (this.cannon) this.cannon.resetForNewLevel();
        }
    }

    private onLevelSwitched() {
        this.resetForLevel(this.resolveMaxProjectiles());
        if (this.cannon) this.cannon.resetForNewLevel();
    }

    private resetForLevel(max: number) {
        this.unscheduleAllCallbacks();
        this.clearAllProjectiles(false);

        this.maxProjectiles = max;
        this.usedCount = 0;

        this.updateProjectileCountLabel();
        this.resetIndicators();

        if (this.maxProjectiles > 0) {
            this.prepareNextProjectile();
        } else if (this.cannon) {
            this.cannon.clearProjectile();
        }
    }

    private onProjectileLaunched() {
        this.usedCount++;

        const shotAtMs = performance.now();
        const launched = this.activeProjectile;
        if (launched) {
            this.inFlight.push(launched);
            this.activeProjectile = null;
            this.scheduleOnce(() => this.despawnProjectile(launched), this.projectileLifetime);
        }

        this.updateProjectileCountLabel();
        this.playIndicatorOff(this.usedCount - 1);

        if (this.node.scene) this.node.scene.emit('projectile-fired');

        this.scheduleOnce(() => this.checkMiss(shotAtMs), this.missCheckDelay);

        const remaining = this.maxProjectiles - this.usedCount;
        if (remaining > 0) {
            this.scheduleOnce(() => this.prepareNextProjectile(), 0.1);
        } else if (this.cannon) {
            this.cannon.clearProjectile();
        }
    }

    private checkMiss(shotAtMs: number) {
        if (SoundManager.getLastHitTimestampMs() >= shotAtMs) return;
        if (!this.missSoundName) return;
        SoundManager.playOneShot(this.missSoundName);
    }

    /** Убрать снаряд из мира через lifetime после выстрела */
    private despawnProjectile(projectile: Node) {
        const idx = this.inFlight.indexOf(projectile);
        if (idx >= 0) this.inFlight.splice(idx, 1);
        if (isValid(projectile)) this.releaseProjectile(projectile);
    }

    private prepareNextProjectile() {
        if (!this.cannon || this.usedCount >= this.maxProjectiles) return;

        const projectile = this.acquireProjectile();
        if (!projectile) return;

        const spawnPos = this.getSpawnWorldPosition();
        projectile.setWorldPosition(spawnPos);
        projectile.setRotationFromEuler(0, 0, 0);
        this.resetProjectilePhysics(projectile, true);

        this.activeProjectile = projectile;
        this.cannon.setProjectile(projectile);
    }

    private getSpawnWorldPosition(): Vec3 {
        if (isValid(this.projectileSpawnPoint)) {
            return this.projectileSpawnPoint.worldPosition.clone();
        }
        if (this.cannon && isValid(this.cannon.cannonMuzzle)) {
            return this.cannon.cannonMuzzle.worldPosition.clone();
        }
        return this.node.worldPosition.clone();
    }

    private acquireProjectile(): Node | null {
        let projectile: Node | null = null;

        while (this.pool.length > 0) {
            const candidate = this.pool.pop();
            if (isValid(candidate)) {
                projectile = candidate;
                break;
            }
        }

        if (!projectile) {
            if (!this.projectilePrefab) return null;
            projectile = instantiate(this.projectilePrefab);
            this.node.scene?.addChild(projectile);
        }

        projectile.active = true;
        return projectile;
    }

    private releaseProjectile(projectile: Node) {
        if (!isValid(projectile)) return;

        this.resetProjectilePhysics(projectile, false);
        projectile.active = false;
        this.pool.push(projectile);
    }

    private resetProjectilePhysics(projectile: Node, enableAsKinematic: boolean) {
        const rb = projectile.getComponent(RigidBody);
        if (rb) {
            rb.setLinearVelocity(Vec3.ZERO);
            rb.setAngularVelocity(Vec3.ZERO);
            if (enableAsKinematic) {
                rb.enabled = true;
                rb.useGravity = false;
                rb.type = RigidBody.Type.KINEMATIC;
            } else {
                rb.enabled = false;
            }
        }

        const collider = projectile.getComponent(Collider);
        if (collider) collider.enabled = enableAsKinematic;

        const meshes = projectile.getComponentsInChildren(MeshRenderer);
        for (const mesh of meshes) mesh.enabled = false;
    }

    private clearAllProjectiles(destroyPool: boolean) {
        if (this.activeProjectile && isValid(this.activeProjectile)) {
            this.releaseProjectile(this.activeProjectile);
        }
        this.activeProjectile = null;

        for (const projectile of this.inFlight) {
            if (isValid(projectile)) this.releaseProjectile(projectile);
        }
        this.inFlight.length = 0;

        if (destroyPool) {
            for (const projectile of this.pool) {
                if (isValid(projectile)) projectile.destroy();
            }
            this.pool.length = 0;
        }
    }

    private updateProjectileCountLabel() {
        const label = this.projectileCountLabel?.getComponent(Label);
        if (!label) return;
        label.string = `${Math.max(this.maxProjectiles - this.usedCount, 0)}`;
    }

    private playIndicatorOff(index: number) {
        if (index < 0 || index >= this.visualIndicators.length) return;
        const node = this.visualIndicators[index];
        if (!isValid(node)) return;

        const anim = node.getComponent(Animation);
        if (anim && anim.getState('BombOff')) {
            anim.play('BombOff');
            anim.once(Animation.EventType.FINISHED, () => {
                this.scheduleOnce(() => {
                    if (isValid(node)) node.active = false;
                }, 0.2);
            });
        } else {
            node.active = false;
        }
    }

    private resetIndicators() {
        for (let i = 0; i < this.visualIndicators.length; i++) {
            const node = this.visualIndicators[i];
            if (!isValid(node)) continue;

            const shouldShow = i < this.maxProjectiles;
            node.active = shouldShow;
            if (!shouldShow) continue;

            const anim = node.getComponent(Animation);
            if (anim && anim.getState('BombOn')) {
                anim.stop();
                anim.play('BombOn');
            }
        }
    }
}
