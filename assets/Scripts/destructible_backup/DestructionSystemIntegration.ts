import { _decorator, Component, director, find, Node, PhysicsSystem, CCBoolean, RigidBody, Vec3 } from 'cc';
import { BirdObject } from './BirdObject';
import { DestructibleObject } from './DestructibleObject';
// import { CollisionSoundManager } from './CollisionSoundManager';
// import { DebrisManager } from './DebrisManager';
// import { BirdManager } from '../BirdManager'; // УДАЛЕН - заменен на ProjectileManager
import { ProjectileManager } from '../ProjectileManager';
const { ccclass, property } = _decorator;

/**
 * Класс для интеграции системы разрушений с существующей системой игры
 */
@ccclass('DestructionSystemIntegration')
export class DestructionSystemIntegration extends Component {
    @property(ProjectileManager)
    projectileManager: ProjectileManager = null;

    @property(CCBoolean)
    autoFindProjectileManager: boolean = true;

    onLoad() {
        // Если не задан ProjectileManager, находим его автоматически
        if (!this.projectileManager && this.autoFindProjectileManager) {
            this.projectileManager = find('ProjectileManager')?.getComponent(ProjectileManager);
        }

        if (!this.projectileManager) {
            console.error('DestructionSystemIntegration: Не найден компонент ProjectileManager!');
            return;
        }

        // Временно отключено для упрощения тестирования
        // this.checkManagers();

        // Подписываемся на событие запуска снаряда
        this.projectileManager.node.on('projectile-launched', this.onProjectileLaunched, this);
    }

    onDestroy() {
        // Отписываемся от событий
        if (this.projectileManager && this.projectileManager.node) {
            this.projectileManager.node.off('projectile-launched', this.onProjectileLaunched, this);
        }
    }

    /**
     * Обработчик события запуска снаряда
     */
    onProjectileLaunched() {
        const activeProjectile = this.projectileManager.activeProjectile;
        if (!activeProjectile) return;

        // Добавляем компонент BirdObject к снаряду, если его еще нет
        let birdObject = activeProjectile.getComponent(BirdObject);
        if (!birdObject) {
            birdObject = activeProjectile.addComponent(BirdObject);
        }

        // Устанавливаем флаг запуска
        birdObject.onLaunch();

        // Через некоторое время проверяем, остановился ли снаряд
        this.scheduleOnce(() => {
            this.startCheckingProjectileStatus(activeProjectile);
        }, 1.0);
    }

    /**
     * Проверка необходимых менеджеров
     * Временно отключено для упрощения тестирования
     */
    private checkManagers() {
        /*
        // Проверяем наличие DebrisManager
        if (!DebrisManager.instance()) {
            console.warn('DestructionSystemIntegration: DebrisManager не найден!');
        }
        
        // Проверяем наличие CollisionSoundManager
        if (!CollisionSoundManager.instance()) {
            console.warn('DestructionSystemIntegration: CollisionSoundManager не найден!');
        }
        */
    }
    
    /**
     * Начинаем регулярную проверку статуса снаряда
     */
    startCheckingProjectileStatus(projectileNode: Node) {
        const checkInterval = 0.5; // Интервал проверки в секундах
        let checkCount = 0;
        const maxChecks = 10; // Максимальное число проверок

        const checkStatusScheduler = () => {
            checkCount++;

            if (!projectileNode || !projectileNode.isValid) {
                // Снаряд был уничтожен
                this.unschedule(checkStatusScheduler);
                return;
            }

            const projectileRb = projectileNode.getComponent(RigidBody);
            if (!projectileRb) {
                // RigidBody отсутствует
                this.unschedule(checkStatusScheduler);
                this.projectileManager.node.emit('projectile-stopped');
                return;
            }

            // Проверяем скорость снаряда
            const velocity = new Vec3();
            projectileRb.getLinearVelocity(velocity);
            const speed = velocity.length();

            if (speed < 0.5 || checkCount >= maxChecks) {
                // Снаряд остановился или прошло максимальное время
                this.unschedule(checkStatusScheduler);
                this.projectileManager.node.emit('projectile-stopped');
                return;
            }

            // Продолжаем проверки
            if (checkCount < maxChecks) {
                this.schedule(checkStatusScheduler, checkInterval, 1);
            }
        };

        // Начинаем проверку
        this.schedule(checkStatusScheduler, checkInterval, 1);
    }

    /**
     * Применение компонентов разрушения ко всем объектам на сцене
     * Вызывайте этот метод один раз при загрузке уровня
     */
    applyDestructionComponentsToScene() {
        // Обходим все деревянные объекты и добавляем WoodObject
        const woodObjects = director.getScene().getComponentsInChildren('WoodTag');
        for (const tag of woodObjects) {
            const node = tag.node;
            if (!node.getComponent(DestructibleObject)) {
                node.addComponent('WoodObject');
            }
        }

        // Обходим все ледяные объекты и добавляем IceObject
        const iceObjects = director.getScene().getComponentsInChildren('IceTag');
        for (const tag of iceObjects) {
            const node = tag.node;
            if (!node.getComponent(DestructibleObject)) {
                node.addComponent('IceObject');
            }
        }

        // Обходим все каменные объекты и добавляем StoneObject
        const stoneObjects = director.getScene().getComponentsInChildren('StoneTag');
        for (const tag of stoneObjects) {
            const node = tag.node;
            if (!node.getComponent(DestructibleObject)) {
                node.addComponent('StoneObject');
            }
        }

        // Обходим всех свиней и добавляем PigObject
        const pigs = director.getScene().getComponentsInChildren('PigTag');
        for (const tag of pigs) {
            const node = tag.node;
            if (!node.getComponent(DestructibleObject)) {
                node.addComponent('PigObject');
            }
        }
    }
}
