import { _decorator, Component, Node, isValid, director } from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';
// Предполагаем, что ScoreManager имеет метод addScore(points: number)
// Если ScoreManager - это компонент, который вы не предоставили, этот импорт может быть неверным
// interface IScoreManager { addScore(points: number): void; }

const { ccclass, property } = _decorator;

/**
 * Менеджер уровня - собирает все разрушаемые объекты, отслеживает их состояние и снаряды.
 * Определяет победу/поражение и инициирует переход к следующему уровню.
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

    private destructibleObjects: UniversalCollisionHandler[] = [];
    private currentProjectileCount: number = 0;
    private isLevelComplete: boolean = false;
    private isLevelStarted: boolean = false;

    // --- Жизненный цикл и Инициализация ---

    onLoad() {
        this.collectDestructibles();
    }

    start() {
        this.subscribeToEvents();
        // Уровень должен быть явно запущен LevelSwitcher, но на случай ручного старта
        // this.startLevel();
    }

    // Собираем все разрушаемые объекты в массив
    private collectDestructibles() {
        this.destructibleObjects = [];

        // Используем либо указанный узел, либо сам LevelManager.node
        const parent = isValid(this.destructiblesParent) ? this.destructiblesParent : this.node;
        const handlers = parent.getComponentsInChildren(UniversalCollisionHandler);

        for (const handler of handlers) {
            if (isValid(handler)) {
                this.destructibleObjects.push(handler);
            }
        }

        if (this.destructibleObjects.length === 0) {
            console.warn(`LevelManager: На уровне ${this.levelNumber} нет разрушаемых объектов. Победа будет невозможна.`);
        }
    }

    // Подписываемся на события
    private subscribeToEvents() {
        // Слушаем события от разрушаемых объектов
        for (const obj of this.destructibleObjects) {
            if (isValid(obj) && isValid(obj.node)) {
                obj.node.on('destroyed', this.onObjectDestroyed, this);
            }
        }

        // Слушаем событие выстрела снаряда на сцене
        if (director.getScene()) {
            director.getScene().on('projectile-fired', this.onProjectileFired, this);
        }
    }

    // --- Управление уровнем ---

    /**
     * Начать уровень
     */
    public startLevel() {
        this.isLevelStarted = true;
        this.isLevelComplete = false;
        this.currentProjectileCount = 0;

        this.node.emit('level-started', this.levelNumber);

        // Отправляем начальное состояние счетчика снарядов
        this.node.emit('projectiles-updated', {
            current: this.currentProjectileCount,
            max: this.maxProjectiles
        });
    }

    // --- Обработчики событий ---

    /**
     * Вызывается при выстреле снаряда (отправляется ProjectileManager'ом)
     */
    private onProjectileFired() {
        if (!this.isLevelStarted || this.isLevelComplete) return;

        this.currentProjectileCount++;

        // Обновляем UI счетчик снарядов
        this.node.emit('projectiles-updated', {
            current: this.currentProjectileCount,
            max: this.maxProjectiles
        });

        // Проверяем не закончились ли снаряды
        if (this.currentProjectileCount >= this.maxProjectiles) {
            // Даем 2 секунды на завершение полета/анимаций
            this.scheduleOnce(this.checkLevelCompletion, 2);
        }
    }

    /**
     * Вызывается при уничтожении объекта
     */
    private onObjectDestroyed(destroyedHandler: UniversalCollisionHandler) {
        if (!this.isLevelStarted || this.isLevelComplete) return;

        // Получаем очки от уничтоженного объекта и обновляем счет
        if (destroyedHandler && destroyedHandler.scoreValue > 0) {
            this.addScoreToManager(destroyedHandler.scoreValue);
        }

        // Проверяем победу (все объекты уничтожены)
        // Небольшая задержка, чтобы дать сцене обновиться после разрушения
        this.scheduleOnce(this.checkLevelCompletion, 0.5);
    }

    // Добавить очки в ScoreManager
    private addScoreToManager(points: number) {
        if (isValid(this.scoreManager)) {
            // Использование явного типа (если доступен) или 'any'
            const scoreComponent = this.scoreManager.getComponent('ScoreManager');
            if (scoreComponent && (scoreComponent as any).addScore) {
                (scoreComponent as any).addScore(points);
            }
        }
    }

    // --- Логика завершения ---

    /**
     * Проверка завершения уровня (Победа или Поражение)
     */
    private checkLevelCompletion() {
        if (this.isLevelComplete) return;

        const remaining = this.getRemainingObjectsCount();
        const projectilesUsed = this.currentProjectileCount >= this.maxProjectiles;

        // ПОБЕДА: все объекты уничтожены
        if (remaining === 0) {
            this.completeLevelVictory();
        }
        // ПОРАЖЕНИЕ: снаряды закончились, но остались объекты
        else if (projectilesUsed && remaining > 0) {
            this.completeLevelDefeat();
        }
    }

    // Победа
    private completeLevelVictory() {
        this.isLevelComplete = true;

        this.node.emit('level-completed', {
            levelNumber: this.levelNumber,
            victory: true,
            remainingObjects: 0,
            projectilesUsed: this.currentProjectileCount
        });

        // Уведомляем LevelSwitcher о переходе к следующему уровню
        this.scheduleOnce(() => {
            if (director.getScene()) {
                // Убрал второй аргумент `false`, предполагая, что LevelSwitcher знает, что это победа
                director.getScene().emit('request-next-level');
            }
        }, 0.5);
    }

    // Поражение
    private completeLevelDefeat() {
        this.isLevelComplete = true;
        const remaining = this.getRemainingObjectsCount();

        this.node.emit('level-completed', {
            levelNumber: this.levelNumber,
            victory: false,
            remainingObjects: remaining,
            projectilesUsed: this.currentProjectileCount
        });

        // В случае поражения LevelSwitcher должен показать "Game Over" или "Try Again"
        this.scheduleOnce(() => {
            if (director.getScene()) {
                director.getScene().emit('request-game-over');
            }
        }, 3); // 3 секунды на просмотр результата
    }

    // Подсчет оставшихся объектов
    private getRemainingObjectsCount(): number {
        let count = 0;
        for (const obj of this.destructibleObjects) {
            // Проверяем валидность, наличие узла и свойство 'isDestroyed'
            if (isValid(obj) && isValid(obj.node) && !(obj as any).isDestroyed) {
                count++;
            }
        }
        return count;
    }

    // --- Публичные методы и Очистка ---

    public getProjectilesRemaining(): number {
        return Math.max(0, this.maxProjectiles - this.currentProjectileCount);
    }

    public isComplete(): boolean {
        return this.isLevelComplete;
    }

    onDestroy() {
        // Отписываемся от событий объектов
        for (const obj of this.destructibleObjects) {
            if (isValid(obj) && isValid(obj.node)) {
                obj.node.off('destroyed', this.onObjectDestroyed, this);
            }
        }

        // Отписываемся от события на сцене
        if (director.getScene()) {
            director.getScene().off('projectile-fired', this.onProjectileFired, this);
        }
        this.unscheduleAllCallbacks();
    }
}