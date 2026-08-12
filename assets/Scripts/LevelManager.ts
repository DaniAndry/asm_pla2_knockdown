import { _decorator, Component, Node, isValid, director, Camera, PhysicsSystem, CCFloat, CCInteger } from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

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

    @property({ tooltip: 'Динамический рендер-каллинг: включать меши только у ближних по Z рядов и у "ожививших" объектов (для тяжёлых уровней с сотнями объектов)' })
    enableRenderCulling: boolean = false;

    @property({ tooltip: 'Дистанция по Z от камеры (в мировых координатах), в пределах которой рендер объекта включён с самого старта уровня' })
    renderCullNearZ: number = 6;

    @property({ tooltip: 'Порог скорости (м/с) — выше него скрытый объект считается "начавшим двигаться" и его рендер включается' })
    renderCullWakeSpeed: number = 0.3;

    @property({ tooltip: 'Прогреть физику на старте уровня: прогнать симуляцию вперёд на Warmup Steps шагов ДО первого кадра, чтобы пирамида "усела" мгновенно (и как можно больше тел успело заснуть), а не на глазах у игрока. Даёт один синхронный хитч при загрузке уровня вместо видимого джиттера первую секунду.' })
    enablePhysicsWarmup: boolean = false;

    @property({ type: CCInteger, tooltip: 'Сколько физических шагов прогнать при прогреве. Больше = дольше хитч при загрузке, но выше шанс что всё успеет осесть и заснуть' })
    warmupSteps: number = 60;

    @property({ type: CCFloat, tooltip: 'Длительность одного шага при прогреве (сек). Обычно совпадает с fixedTimeStep в PhysicsBootstrap' })
    warmupStepDt: number = 1 / 60;

    private destructibleObjects: UniversalCollisionHandler[] = [];
    private hiddenRenderObjects: UniversalCollisionHandler[] = [];
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
        const camera = isValid(this.mainCamera)
            ? this.mainCamera
            : (this.node.scene?.getComponentInChildren(Camera) ?? null);
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
        this.unschedule(this.revealMovingHiddenObjects);

        this.isLevelStarted = true;
        this.isLevelComplete = false;
        this.currentProjectileCount = 0;
        this.lastClearedAll = false;

        if (this.enablePhysicsWarmup) {
            this.fastForwardSettle();
        }

        this.collectDestructibles();
        this.ensureSceneSubscription();
        this.applyInitialRenderCulling();

        this.node.emit('level-started', this.levelNumber);
        this.node.emit('projectiles-updated', {
            current: this.currentProjectileCount,
            max: this.maxProjectiles
        });

        if (director.getScene()) {
            director.getScene().emit('level-projectiles-ready', { max: this.maxProjectiles });
        }


        this.scheduleOnce(this.pollLevelProgress, 0);
        this.scheduleOnce(this.pollLevelProgress, 0.25);
        this.schedule(this.pollLevelProgress, 0.4);

        if (this.enableRenderCulling) {
            this.schedule(this.revealMovingHiddenObjects, 0.1);
        }
    }

    // Прогоняет физику вперёд на warmupSteps шагов ОДНИМ синхронным блоком —
    // пирамида "усядется" ещё до первого отрисованного кадра игроком, вместо
    // видимого джиттера первую секунду. Даёт короткий синхронный хитч при
    // загрузке уровня (пропорционален числу шагов и тяжести сцены), но не
    // меняет ничьё поведение/тип объектов — это то же самое честное
    // усаживание, просто сжатое во времени. autoSimulation временно
    // выключается на время прогрева и восстанавливается, чтобы не задвоить
    // шаг с PhysicsBootstrap.update().
    private fastForwardSettle() {
        const ps = PhysicsSystem.instance;
        if (!ps || typeof (ps as any).simulate !== 'function') return;

        const wasAuto = ps.autoSimulation;
        ps.autoSimulation = false;

        const steps = Math.max(1, Math.floor(this.warmupSteps));
        const dt = Math.max(1 / 240, this.warmupStepDt);

        try {
            for (let i = 0; i < steps; i++) {
                ps.simulate(dt);
            }
        } catch (e) {
            console.warn('[LevelManager] fastForwardSettle: ps.simulate упал во время прогрева, останавливаю.', e);
        }

        ps.autoSimulation = wasAuto;
    }

    // Скрывает MeshRenderer у объектов дальше renderCullNearZ от камеры по Z
    // (задние ряды пирамиды, которых не видно из-за передних). Физику не
    // трогаем — только рендер, чтобы снизить нагрузку на GPU на тяжёлых
    // уровнях (сотни объектов). Скрытые объекты попадают в hiddenRenderObjects
    // и дальше отслеживаются revealMovingHiddenObjects() — как только такой
    // объект начинает двигаться (толкнули при обвале), его снова показываем.
    private applyInitialRenderCulling() {
        this.hiddenRenderObjects.length = 0;
        if (!this.enableRenderCulling) return;

        const camera = isValid(this.mainCamera)
            ? this.mainCamera
            : (this.node.scene?.getComponentInChildren(Camera) ?? null);
        if (!isValid(camera)) return;

        const camZ = camera.node.worldPosition.z;

        for (const obj of this.destructibleObjects) {
            if (!isValid(obj) || !isValid(obj.node)) continue;

            const distZ = Math.abs(obj.node.worldPosition.z - camZ);
            const visible = distZ <= this.renderCullNearZ;

            obj.setRenderersEnabled(visible);
            if (!visible) this.hiddenRenderObjects.push(obj);
        }
    }

    // Лёгкий частый проход ТОЛЬКО по скрытым объектам (их обычно намного
    // меньше, чем всего destructibleObjects) — проверяет скорость и
    // раскрывает рендер, как только объект реально задвигался.
    private revealMovingHiddenObjects = () => {
        if (this.hiddenRenderObjects.length === 0) return;

        const speedThresholdSqr = this.renderCullWakeSpeed * this.renderCullWakeSpeed;

        for (let i = this.hiddenRenderObjects.length - 1; i >= 0; i--) {
            const obj = this.hiddenRenderObjects[i];
            if (!isValid(obj) || obj.isDestroyed || !isValid(obj.node)) {
                this.hiddenRenderObjects.splice(i, 1);
                continue;
            }
            if (obj.isMovingBeyond(speedThresholdSqr)) {
                obj.setRenderersEnabled(true);
                this.hiddenRenderObjects.splice(i, 1);
            }
        }
    };

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

        // Пока стек ещё "усаживается" под гравитацией на старте уровня
        // (CannonController держит физику разморожённой settleDuration секунд —
        // это то же самое время, на которое отключены звуки ударов через
        // SoundManager.hitsEnabled), объекты из-за исходных перекрытий могут
        // на мгновение проскочить границы уровня. Раньше это считалось честным
        // "вылетом" и уничтожало объект — на плотных уровнях (типа 3-го) это
        // могло разом снести половину уровня и ложно засчитать победу.
        // NaN/Infinity координаты — это всегда баг физики, чистим в любой момент.
        const skipSoftBoundsCheck = !SoundManager.hitsEnabled;

        for (let i = 0; i < this.destructibleObjects.length; i++) {
            const obj = this.destructibleObjects[i];
            if (!isValid(obj) || obj.isDestroyed) continue;
            if (!isValid(obj.node) || !obj.node.activeInHierarchy) continue;

            const p = obj.node.worldPosition;

            // Если физика "взорвалась" (NaN/Infinity после нестабильного удара),
            // сравнения вида `p.y < killY` с NaN ВСЕГДА дают false — объект
            // никогда не попадёт под очистку, останется в иерархии невидимым
            // и будет вечно считаться "живым", блокируя завершение уровня.
            // Поэтому нефинитную позицию тоже считаем выходом за пределы.
            const isInvalid = !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z);
            const isOutOfSoftBounds = !skipSoftBoundsCheck
                && (p.y < killY || Math.abs(p.x) > bound || Math.abs(p.z) > bound);

            if (isInvalid || isOutOfSoftBounds) {
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
        this.hiddenRenderObjects.length = 0;
    }
}
