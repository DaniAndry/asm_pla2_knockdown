import { _decorator, Component, Node, MeshRenderer, Material, input, Input, EventTouch, Vec3, CCFloat, ParticleSystem, RigidBody, CCBoolean } from 'cc';
import { DestructibleObject, MaterialType } from './DestructibleObject';
const { ccclass, property } = _decorator;

/**
 * Класс для птиц (снарядов)
 */
@ccclass('BirdObject')
export class BirdObject extends DestructibleObject {
    @property(Material)
    damageMaterial: Material = null;

    @property(CCBoolean)
    hasSpecialAbility: boolean = false;

    private _wasLaunched: boolean = false;
    private _specialActivated: boolean = false;

    onLoad() {
        console.log(`[${this.node.name}] BirdObject.onLoad - регистрируем обработчики`);
        super.onLoad();
        
        // ВАЖНО: Снова регистрируем обработчик коллизий, так как super.onLoad() уже зарегистрировал его
        // но нам нужно убедиться, что наши обработчики будут вызваны
        this.node.off('collision-enter', this.onCollision, this); // Сначала удаляем предыдущую регистрацию
        this.node.on('collision-enter', this.onCollision, this); // Заново регистрируем
        
        // Также добавляем обработчики для других событий коллизий
        this.node.on('collision-stay', this.onCollisionStay, this);
        this.node.on('trigger-enter', this.onTriggerEnter, this);
        
        // Устанавливаем тип материала
        this._materialType = MaterialType.Bird;
        
        // Настройки птицы
        this.health = 50;
        this.damageFactor = 1.0;
        this.damageThreshold = 2.0; // Снижаем порог урона для тестирования
        this.scoreValue = 0; // За уничтожение своей птицы очков не даем
        
        // Подписываемся на событие касания для активации спец-способности
        this.node.on(Node.EventType.TOUCH_END, this.activateSpecialAbility, this);
    }

    onDestroy() {
        super.onDestroy();
        
        // Отписываемся от всех событий
        this.node.off(Node.EventType.TOUCH_END, this.activateSpecialAbility, this);
        this.node.off('collision-stay', this.onCollisionStay, this);
        this.node.off('trigger-enter', this.onTriggerEnter, this);
    }

    /**
     * Вызывается при запуске птицы из рогатки
     */
    onLaunch() {
        console.log(`[${this.node.name}] Птица запущена!`);
        this._wasLaunched = true;
    }
    
    /**
     * Обработка продолжающегося контакта (когда объекты продолжают взаимодействовать)
     */
    onCollisionStay(event: any) {
        console.log(`[${this.node.name}] Продолжающееся столкновение с ${event.otherCollider?.node?.name || 'неизвестный объект'}`);
    }
    
    /**
     * Обработка входа в триггер (для collider-ов с isTrigger = true)
     */
    onTriggerEnter(event: any) {
        console.log(`[${this.node.name}] Вход в триггер ${event.otherCollider?.node?.name || 'неизвестный объект'}`);
    }

    /**
     * Активация специальной способности птицы (по тапу во время полета)
     */
    activateSpecialAbility() {
        // Проверяем, что птица запущена и способность еще не активирована
        if (!this._wasLaunched || this._specialActivated || !this.hasSpecialAbility) return;
        
        this._specialActivated = true;
        
        // Здесь реализуется специальная способность конкретной птицы
        // Например:
        this.node.emit('bird-ability-activated', this.node);
        
        // Визуальный эффект активации
        this.playSpecialAbilityEffect();
    }

    /**
     * Визуальный эффект активации способности
     */
    playSpecialAbilityEffect() {
        // В базовой реализации ничего не делаем
        // В дочерних классах для разных типов птиц будут свои эффекты
    }

    /**
     * Вызывается при повреждении объекта
     */
    onDamaged() {
        if (this.damageMaterial) {
            const meshRenderer = this.getComponent(MeshRenderer);
            if (meshRenderer) {
                meshRenderer.setMaterial(this.damageMaterial, 0);
            }
        }
        
        // Звуки и эффекты временно отключены для упрощения отладки
        /*
        if (this.hitSound) {
            this.hitSound.play();
        }
        
        if (this.destructionParticles) {
            this.destructionParticles.play();
        }
        */
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
}
