import { _decorator, Component, Node, isValid, director, Camera } from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';

const { ccclass, property } = _decorator;

/**
 * Менеджер уровня — следит за снарядами и разрушаемыми объектами.
 * Победа: все объекты уничтожены → request-next-level
 * Поражение: снаряды кончились, объекты остались → request-lose
 */
@ccclass('LevelManager')
export class LevelManager extends Component {
    @property({ type: Node, tooltip: 'Родительский узел со всеми разрушаемыми объектами' })
    destructiblesParent: Node = null;

    @property({ tooltip: 'Количество доступных снарядов для уровня' })
    maxProjectiles: number = 10;

    @property({ tooltip: 'Номер текущего уровня (1, 2, 3...)' })
    levelNumber: number = 1;

    @property({ type: Node, tooltip: 'ScoreManager для добавления очков' })
    scoreManager: Node = null;

    @property({ type: Camera, tooltip: 'Камера для Billboard / score popup' })
    mainCamera: Camera = null;

    @property({ tooltip: 'Задержка перед поражением, когда кончились снаряды (сек)' })
    outOfAmmoDelay: number = 2;

    @property({ tooltip: 'Задержка перед победой после зачистки (сек)' })
    clearLevelDelay: number = 0.8;

    @property({ tooltip: 'Ниже этой Y объект считается выпавшим и уничтожается' })
    killY: number = -2.5;

    @property({ tooltip: 'За пределами |X|/|Z| объект считается вылетевшим' })
    outOfBoundsXZ: number = 22;

    private destructibleObjects: UniversalCollisionHandler[] = [];
    private currentProjectileCount: number = 0;
    private isLevelComplete: boolean = false;
    private isLevelStarted: boolean = false;
    private subscribedToScene: boolean = false;
    private lastClearedAll: boolean = false;

    onLoad() {
        this.collectDestructibles();
    }

    start() {
        this.ensureSceneSubscription();
        this.applySharedRefsToHandlers();
    }

    private collectDestructibles() {
        this.unsubscribeFromDestructibles();
        this.destructibleObjects = [];

        const parent = isValid(this.destructiblesParent) ? this.destructiblesParent : this.node;
        const handlers = parent.getComponentsInChildren(UniversalCollisionHandler);

        for (const handler of handlers) {
            if (isValid(handler)) {
                this.destructibleObjects.push(handler);
            }
        }

        this.subscribeToDestructibles();
        this.applySharedRefsToHandlers();

        if (this.destructibleObjects.length === 0) {
            console.warn(`LevelManager: На уровне ${this.levelNumber} нет разрушаемых объектов.`);
        }
    }

    private applySharedRefsToHandlers() {
        const camera = isValid(this.mainCamera) ? this.mainCamera : Camera.main;
        for (const handler of this.destructibleObjects) {
            if (isValid(handler)) {
                handler.applyLevelSharedRefs(camera);
            }
        }
    }

    private subscribeToDestructibles() {
        for (const obj of this.destructibleObjects) {
            if (isValid(obj) && isValid(obj.node)) {
                obj.node.off('destroyed', this.onObjectDestroyed, this);
                obj.node.on('destroyed', this.onObjectDestroyed, this);
            }
        }
    }

    private unsubscribeFromDestructibles() {
        for (const obj of this.destructibleObjects) {
            if (isValid(obj) && isValid(obj.node)) {
                obj.node.off('destroyed', this.onObjectDestroyed, this);
            }
        }
    }

    private ensureSceneSubscription() {
        if (this.subscribedToScene) return;
        const scene = director.getScene();
        if (!scene) return;
        scene.on('projectile-fired', this.onProjectileFired, this);
        this.subscribedToScene = true;
    }

    public startLevel() {
        this.unschedule(this.emitLevelResult);
        this.unschedule(this.checkLevelCompletion);
        this.unschedule(this.checkLevelCompletionLate);
        this.unschedule(this.pollLevelProgress);

        this.isLevelStarted = true;
        this.isLevelComplete = false;
        this.currentProjectileCount = 0;
        this.lastClearedAll = false;

        this.collectDestructibles();
        this.ensureSceneSubscription();

        this.node.emit('level-started', this.levelNumber);
        this.node.emit('projectiles-updated', {
            current: this.currentProjectileCount,
            max: this.maxProjectiles
        });

        if (director.getScene()) {
            director.getScene().emit('level-projectiles-ready', { max: this.maxProjectiles });
        }

        // Пустой уровень (часто Level 3) — победа сразу, не ждать падений
        this.scheduleOnce(this.pollLevelProgress, 0);
        this.scheduleOnce(this.pollLevelProgress, 0.25);
        this.schedule(this.pollLevelProgress, 0.4);
    }

    private onProjectileFired() {
        if (!this.isLevelActive()) return;

        this.currentProjectileCount++;
        this.node.emit('projectiles-updated', {
            current: this.currentProjectileCount,
            max: this.maxProjectiles
        });

        if (this.currentProjectileCount >= this.maxProjectiles) {
            this.unschedule(this.checkLevelCompletion);
            this.scheduleOnce(this.checkLevelCompletion, this.outOfAmmoDelay);
        }
    }

    private onObjectDestroyed(destroyedHandler: UniversalCollisionHandler) {
        if (!this.isLevelActive()) return;

        if (destroyedHandler && destroyedHandler.scoreValue > 0) {
            this.addScoreToManager(destroyedHandler.scoreValue);
        }

        this.unschedule(this.checkLevelCompletion);
        this.unschedule(this.checkLevelCompletionLate);
        this.scheduleOnce(this.checkLevelCompletion, 0.35);
        this.scheduleOnce(this.checkLevelCompletionLate, 1.5);
    }

    private addScoreToManager(points: number) {
        if (!isValid(this.scoreManager)) return;
        const scoreComponent = this.scoreManager.getComponent('ScoreManager');
        if (scoreComponent && (scoreComponent as any).addScore) {
            (scoreComponent as any).addScore(points);
        }
    }

    /** Периодически: добиваем выпавших + проверяем clear */
    private pollLevelProgress = () => {
        if (!this.isLevelActive()) return;

        this.cullOutOfBoundsDestructibles();

        if (this.getRemainingObjectsCount() === 0) {
            this.completeLevel(true);
        }
    };

    private cullOutOfBoundsDestructibles() {
        const killY = this.killY;
        const bound = Math.max(5, this.outOfBoundsXZ);

        for (let i = 0; i < this.destructibleObjects.length; i++) {
            const obj = this.destructibleObjects[i];
            if (!isValid(obj) || obj.isDestroyed) continue;
            if (!isValid(obj.node) || !obj.node.activeInHierarchy) continue;

            const p = obj.node.worldPosition;
            if (p.y < killY || Math.abs(p.x) > bound || Math.abs(p.z) > bound) {
                obj.forceDestroyOutOfBounds();
            }
        }
    }

    private checkLevelCompletion = () => {
        if (!this.isLevelActive()) return;

        this.cullOutOfBoundsDestructibles();

        const remaining = this.getRemainingObjectsCount();
        const outOfAmmo = this.currentProjectileCount >= this.maxProjectiles;

        if (remaining === 0) {
            this.completeLevel(true);
            return;
        }

        if (outOfAmmo) {
            this.completeLevel(false);
        }
    };

    private checkLevelCompletionLate = () => {
        this.checkLevelCompletion();
    };

    private completeLevel(clearedAll: boolean) {
        if (this.isLevelComplete) return;
        this.isLevelComplete = true;
        this.lastClearedAll = clearedAll;

        this.unschedule(this.checkLevelCompletion);
        this.unschedule(this.checkLevelCompletionLate);
        this.unschedule(this.pollLevelProgress);
        this.unschedule(this.emitLevelResult);

        this.node.emit('level-completed', {
            levelNumber: this.levelNumber,
            victory: clearedAll,
            remainingObjects: this.getRemainingObjectsCount(),
            projectilesUsed: this.currentProjectileCount
        });

        const delay = clearedAll ? this.clearLevelDelay : 0.4;
        this.scheduleOnce(this.emitLevelResult, delay);
    }

    private emitLevelResult = () => {
        const scene = director.getScene();
        if (!scene) return;

        if (this.lastClearedAll) {
            scene.emit('request-next-level');
        } else {
            scene.emit('request-lose');
        }
    };

    private isLevelActive(): boolean {
        return this.isLevelStarted
            && !this.isLevelComplete
            && this.node.activeInHierarchy;
    }

    private getRemainingObjectsCount(): number {
        let count = 0;
        for (const obj of this.destructibleObjects) {
            if (!isValid(obj)) continue;
            if (obj.isDestroyed) continue;
            if (!isValid(obj.node) || !obj.node.activeInHierarchy) continue;
            count++;
        }
        return count;
    }

    public getProjectilesRemaining(): number {
        return Math.max(0, this.maxProjectiles - this.currentProjectileCount);
    }

    public getAliveDestructibles(): UniversalCollisionHandler[] {
        const result: UniversalCollisionHandler[] = [];
        for (const obj of this.destructibleObjects) {
            if (!isValid(obj) || obj.isDestroyed || !isValid(obj.node)) continue;
            if (!obj.node.activeInHierarchy) continue;
            result.push(obj);
        }
        return result;
    }

    public isComplete(): boolean {
        return this.isLevelComplete;
    }

    onDestroy() {
        this.unsubscribeFromDestructibles();
        const scene = director.getScene();
        if (scene && this.subscribedToScene) {
            scene.off('projectile-fired', this.onProjectileFired, this);
            this.subscribedToScene = false;
        }
        this.unscheduleAllCallbacks();
    }
}
