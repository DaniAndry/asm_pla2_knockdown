import { _decorator, Component, Node, RigidBody, Vec3, CCFloat, CCBoolean, Material, MeshRenderer, Collider } from 'cc';
const { ccclass, property } = _decorator;

import { MaterialType, DestructibleObject } from './DestructibleObject';

/**
 * Упрощенный класс для птиц (временное решение для отладки)
 */
@ccclass('SimpleBirdObject')
export class SimpleBirdObject extends Component {
    @property(Material)
    damageMaterial: Material = null;

    @property(CCBoolean)
    hasSpecialAbility: boolean = false;

    @property(CCFloat)
    damageValue: number = 20;

    private _wasLaunched: boolean = false;
    private _specialActivated: boolean = false;

    onLoad() {
        console.log(`[${this.node.name}] SimpleBirdObject onLoad`);
        
        // Удаляем старые регистрации для избежания дублирования
        this.node.off('collision-enter', this.onCollision, this);
        
        // Регистрируем обработчики различных событий коллизий
        this.node.on('collision-enter', this.onCollision, this);
        this.node.on('collision-stay', this.onCollisionStay, this);
        this.node.on('trigger-enter', this.onTriggerEnter, this);
        
        // Выводим информацию о RigidBody и коллайдерах
        const rb = this.getComponent(RigidBody);
        const colliders = this.getComponents(Collider);
        console.log(`[${this.node.name}] Физические компоненты: RigidBody=${!!rb}, Colliders=${colliders ? colliders.length : 0}`);
        
        if (rb) {
            console.log(`[${this.node.name}] RigidBody настройки: Гравитация=${rb.useGravity}, Активен=${rb.enabled}, Сон=${rb.isSleeping}`);
        }
    }

    onDestroy() {
        // Отписываемся от всех событий
        this.node.off(Node.EventType.TOUCH_END, this.activateSpecialAbility, this);
        this.node.off('collision-enter', this.onCollision, this);
        this.node.off('collision-stay', this.onCollisionStay, this);
        this.node.off('trigger-enter', this.onTriggerEnter, this);
    }

    /**
     * Вызывается при запуске птицы из рогатки
     */
    onLaunch() {
        console.log(`[${this.node.name}] Птица запущена!`);
        this._wasLaunched = true;
        
        // Проверяем и активируем RigidBody и физику
        const rb = this.getComponent(RigidBody);
        if (rb) {
            console.log(`[${this.node.name}] Активируем RigidBody и физику для птицы`);
            rb.enabled = true;
            rb.useGravity = true;
            // Пробуждаем RigidBody если он спит
            if (rb.isSleeping) {
                rb.wakeUp();
            }
        }
        
        // Добавляем обработчик касания для спецспособности
        this.node.on(Node.EventType.TOUCH_END, this.activateSpecialAbility, this);
    }

    /**
     * Активация специальной способности птицы (по тапу во время полета)
     */
    activateSpecialAbility() {
        // Проверяем, что птица запущена и способность еще не активирована
        if (!this._wasLaunched || this._specialActivated || !this.hasSpecialAbility) return;
        
        console.log(`[${this.node.name}] Активирована спецспособность птицы`);
        this._specialActivated = true;
        
        // Отправляем событие об активации способности
        this.node.emit('bird-ability-activated', this.node);
    }
    
    /**
     * Остановка птицы (для статического состояния)
     */
    stopMovement() {
        const rb = this.getComponent(RigidBody);
        if (rb) {
            rb.setLinearVelocity(new Vec3(0, 0, 0));
            rb.setAngularVelocity(new Vec3(0, 0, 0));
            rb.useGravity = false;
            rb.enabled = false;
        }
    }
    
    /**
     * Обработка столкновений
     * @param event Событие столкновения
     */
    onCollision(event: any) {
        const otherNode = event.otherCollider?.node;
        if (!otherNode) {
            console.log(`[${this.node.name}] Столкновение с неизвестным объектом`);
            return;
        }
        
        console.log(`[${this.node.name}] СТОЛКНОВЕНИЕ SimpleBirdObject с ${otherNode.name}`);
        console.log(`Детали столкновения: type=${event.type}, контакты=${event.contacts ? event.contacts.length : 0}`);
        
        // Получаем скорость столкновения
        const rb = this.getComponent(RigidBody);
        if (rb) {
            const velocity = new Vec3();
            rb.getLinearVelocity(velocity);
            console.log(`Скорость птицы при столкновении: ${velocity.length().toFixed(2)}`);
        }
        
        // Проверяем, есть ли у объекта компонент DestructibleObject
        const destructible = otherNode.getComponent(DestructibleObject);
        if (destructible) {
            console.log(`[${this.node.name}] Обнаружен DestructibleObject на ${otherNode.name}, пытаемся нанести урон ${this.damageValue}`);
            
            // Наносим урон напрямую через метод applyDamage
            destructible.applyDamage(this.damageValue);
        } else {
            console.log(`[${this.node.name}] Объект ${otherNode.name} не является DestructibleObject`);
        }
    }
    
    /**
     * Обработка продолжающегося контакта (когда объекты продолжают взаимодействовать)
     */
    onCollisionStay(event: any) {
        // Выводим сообщение только для редких событий, чтобы не засорять лог
        if (Math.random() < 0.01) { // 1% шанс вывода
            console.log(`[${this.node.name}] Продолжающееся столкновение с ${event.otherCollider?.node?.name || 'неизвестный объект'}`);
        }
    }
    
    /**
     * Обработка входа в триггер (для collider-ов с isTrigger = true)
     */
    onTriggerEnter(event: any) {
        console.log(`[${this.node.name}] Вход в триггер ${event.otherCollider?.node?.name || 'неизвестный объект'}`);
    }
}
