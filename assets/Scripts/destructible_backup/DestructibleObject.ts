import { _decorator, Component, Node, RigidBody, Collider, Vec3, CCFloat, AudioSource, game, Prefab, instantiate, ParticleSystem, MeshRenderer, Material, physics } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Типы материалов для разрушаемых объектов
 */
export enum MaterialType {
    Wood,
    Ice,
    Stone,
    Pig,
    Bird
}

/**
 * Базовый класс для разрушаемых объектов
 */
@ccclass('DestructibleObject')
export class DestructibleObject extends Component {
    @property({ type: CCFloat, tooltip: 'Прочность объекта' })
    health: number = 100;

    @property({ type: CCFloat, tooltip: 'Минимальная сила удара для урона' })
    damageThreshold: number = 2; // Временно снижен для тестирования

    @property({ type: CCFloat, tooltip: 'Минимальная сила для мгновенного разрушения' })
    destroyThreshold: number = 100;

    @property({ type: CCFloat, tooltip: 'Множитель урона при столкновении' })
    damageFactor: number = 1.0;

    // @property({ type: Prefab, tooltip: 'Эффект разрушения' })
    // destructionEffect: Prefab = null;

    // @property({ type: ParticleSystem })
    // destructionParticles: ParticleSystem = null;

    // @property({ type: AudioSource, tooltip: 'Звук при получении урона' })
    // hitSound: AudioSource = null;

    // @property({ type: AudioSource, tooltip: 'Звук при разрушении' })
    // destructionSound: AudioSource = null;

    @property({ type: CCFloat, tooltip: 'Очки за разрушение' })
    scoreValue: number = 0;

    @property({ type: CCFloat, tooltip: 'Минимальный порог здоровья для смены спрайта на поврежденный' })
    damagedThreshold: number = 50;

    // @property({ type: ParticleSystem })
    // destructionDebrisParticles: ParticleSystem = null;

    @property({ tooltip: 'Создать объект при разрушении?' })
    spawnOnDestroy: boolean = false;

    @property({ type: CCFloat, tooltip: 'Задержка перед уничтожением объекта' })
    destroyDelay: number = 0.2;

    // Внутренние переменные
    protected _initialHealth: number = 0;
    protected _isDamaged: boolean = false;
    protected _isDestroyed: boolean = false;
    protected _lastDamageTime: number = 0;
    protected _damageInterval: number = 0.1; // Минимальный интервал между повреждениями
    protected _materialType: MaterialType = MaterialType.Wood; // По умолчанию дерево

    onLoad() {
        this._initialHealth = this.health;
        
        // Регистрируем обработчики коллизий для всех типов событий столкновений
        console.log(`[${this.node.name}] Регистрируем обработчики событий коллизий`);
        this.node.on('collision-enter', this.onCollision, this);
        this.node.on('collision-stay', this.onCollisionStay, this);
        this.node.on('trigger-enter', this.onTriggerEnter, this);
        
        // Выводим информацию о текущих физических компонентах
        const rb = this.node.getComponent(RigidBody);
        const colliders = this.node.getComponents(Collider);
        
        console.log(`[${this.node.name}] Физические компоненты: RigidBody=${!!rb}, Colliders=${colliders ? colliders.length : 0}`);
        
        if (rb) {
            console.log(`[${this.node.name}] RigidBody настройки: Гравитация=${rb.useGravity}, Активен=${rb.enabled}, Сон=${rb.isSleeping}`);
        }
    }

    onDestroy() {
        // Удаляем все обработчики коллизий
        console.log(`[${this.node.name}] Удаляем обработчики событий коллизий`);
        this.node.off('collision-enter', this.onCollision, this);
        this.node.off('collision-stay', this.onCollisionStay, this);
        this.node.off('trigger-enter', this.onTriggerEnter, this);
    }

    /**
     * Обработка столкновений
     * @param event Событие столкновения
     */
    /**
     * Обработчик события столкновения (stay) - добавлен для расширения обработки коллизий
     */
    onCollisionStay(event: any) {
        console.log(`[${this.node.name}] onCollisionStay с ${event.otherCollider?.node?.name || 'неизвестный объект'}`);
        // Перенаправляем в основной обработчик
        this.onCollision(event);
    }
    
    /**
     * Обработчик события триггера - добавлен для расширения обработки коллизий
     */
    onTriggerEnter(event: any) {
        console.log(`[${this.node.name}] onTriggerEnter с ${event.otherCollider?.node?.name || 'неизвестный объект'}`);
        // Перенаправляем в основной обработчик
        this.onCollision(event);
    }
    
    /**
     * Обработка столкновений
     * @param event Событие столкновения
     */
    onCollision(event: any) {
        const otherNode = event.otherCollider?.node;
        const otherName = otherNode?.name || 'неизвестный объект';
        const myType = this._materialType !== undefined ? MaterialType[this._materialType] : 'неизвестный';
        
        console.log(`[${this.node.name}] (Тип: ${myType}, Здоровье: ${this.health}) Столкновение с ${otherName}`); 
        
        if (this._isDestroyed) {
            console.log(`[${this.node.name}] Объект уже уничтожен, игнорируем столкновение`);
            return;
        }
        
        // Проверяем тип другого объекта (для отладки)
        const otherDestructible = otherNode?.getComponent(DestructibleObject);
        const otherType = otherDestructible ? MaterialType[otherDestructible._materialType] : 'не разрушаемый';
        
        console.log(`[${this.node.name}] Столкновение: ${myType} (порог: ${this.damageThreshold}) с ${otherType}`);
        
        // Проверяем время с последнего урона, чтобы избежать множественных вызовов за короткий промежуток
        const currentTime = game.totalTime / 1000;
        if (currentTime - this._lastDamageTime < this._damageInterval) {
            console.log(`[${this.node.name}] Слишком ранняя попытка урона (интервал ${this._damageInterval}), прошло ${(currentTime - this._lastDamageTime).toFixed(2)} сек.`);
            return;
        }
        
        // Временно снижаем интервал для отладки
        this._damageInterval = 0.05; // 50 мс
        
        // Получаем скорость относительного движения из события столкновения
        let impactForce = 0;
        const otherCollider = event.otherCollider;
        const otherRigidbody = otherCollider?.node.getComponent(RigidBody);
        
        console.log(`[${this.node.name}] Обнаружено столкновение с ${otherCollider?.node?.name || 'неизвестный'}, есть Rigidbody: ${!!otherRigidbody}`);
        
        if (otherRigidbody) {
            const velocity = new Vec3();
            otherRigidbody.getLinearVelocity(velocity);
            impactForce = velocity.length();
            console.log(`[${this.node.name}] Скорость столкновения: ${impactForce.toFixed(2)}, порог урона: ${this.damageThreshold}`);
        } else if (event.contacts && event.contacts.length > 0) {
            const impulse = event.contacts[0].impulse;
            impactForce = impulse.length();
            console.log(`[${this.node.name}] Импульс столкновения: ${impactForce.toFixed(2)}`);
        } else {
            console.log(`[${this.node.name}] Не найден Rigidbody у объекта ${otherCollider?.node?.name} и нет данных о контактах`);
        }
        
        // Проверяем, что сила удара больше минимального порога для нанесения урона
        if (impactForce > this.damageThreshold) {
            console.log(`[${this.node.name}] Сила удара ${impactForce.toFixed(2)} превышает порог ${this.damageThreshold}, наносим урон`);
            this._lastDamageTime = currentTime;
            
            // Проверяем тип материала другого объекта для применения модификаторов урона
            let damageModifier = 1.0;
            const otherDestructible = otherCollider?.node.getComponent(DestructibleObject);
            
            if (otherDestructible) {
                damageModifier = this.calculateDamageModifier(otherDestructible._materialType);
                console.log(`[${this.node.name}] Столкновение с другим DestructibleObject: ${otherCollider?.node?.name}, модификатор урона: ${damageModifier}`);
            }
            
            // Вычисляем финальный урон
            const damage = impactForce * this.damageFactor * damageModifier;
            console.log(`[${this.node.name}] Вычисленный урон: ${damage.toFixed(2)} (сила: ${impactForce.toFixed(2)} * фактор: ${this.damageFactor} * модификатор: ${damageModifier})`);
            
            // Применяем урон к текущему объекту
            this.applyDamage(damage);
            
            // Также наносим урон другому объекту, если он разрушаемый
            // Это важно для взаимодействия между блоками (кирпичами, камнями и т.д.)
            if (otherDestructible && !otherDestructible._isDestroyed) {
                console.log(`[${this.node.name}] Также наносим урон объекту ${otherCollider?.node?.name}`);
                // Тот же расчет урона, но с учетом модификатора материала другого объекта
                const otherDamageModifier = otherDestructible.calculateDamageModifier(this._materialType);
                const otherDamage = impactForce * otherDestructible.damageFactor * otherDamageModifier;
                otherDestructible.applyDamage(otherDamage);
                
                // Для отладки - принудительно снижаем здоровье разрушаемого объекта 
                // если оно остается выше нуля после удара
                if (otherDestructible.health > 0) {
                    console.log(`[${this.node.name}] ОТЛАДКА: Принудительно снижаем здоровье объекта ${otherCollider?.node?.name} до критического`);
                    otherDestructible.health = 1; // Оставляем минимальное здоровье для следующего удара
                }
            }
            
            // Для отладки - принудительно проверяем здоровье текущего объекта
            if (this.health > 0) {
                console.log(`[${this.node.name}] ОТЛАДКА: Здоровье после урона всё еще ${this.health}, ожидается следующий удар`);
            }
        } else {
            // Слишком слабый удар
            console.log(`[${this.node.name}] Сила удара ${impactForce.toFixed(2)} недостаточна для порога ${this.damageThreshold}, игнорируем`);
            return;
        }

        // Проверяем, достаточна ли сила для мгновенного разрушения
        if (impactForce > this.destroyThreshold) {
            this.destroyObject();
        }
    }

    /**
     * Расчет модификатора урона в зависимости от типа материала
     * @param otherMaterial Тип материала другого объекта
     * @returns Модификатор урона
     */
    calculateDamageModifier(otherMaterial: MaterialType): number {
        // Таблица модификаторов урона между разными материалами
        switch (this._materialType) {
            case MaterialType.Wood:
                if (otherMaterial === MaterialType.Bird) return 1.5;
                if (otherMaterial === MaterialType.Stone) return 2.0;
                return 1.0;
                
            case MaterialType.Ice:
                if (otherMaterial === MaterialType.Bird) return 1.2;
                if (otherMaterial === MaterialType.Wood) return 0.8;
                if (otherMaterial === MaterialType.Stone) return 1.8;
                return 1.0;
                
            case MaterialType.Stone:
                if (otherMaterial === MaterialType.Bird) return 0.8;
                return 1.0;
                
            case MaterialType.Pig:
                if (otherMaterial === MaterialType.Bird) return 2.0;
                if (otherMaterial === MaterialType.Wood) return 1.3;
                if (otherMaterial === MaterialType.Stone) return 1.8;
                return 1.0;
                
            case MaterialType.Bird:
                if (otherMaterial === MaterialType.Pig) return 0.5;
                return 1.0;
                
            default:
                return 1.0;
        }
    }

    /**
     * Применение урона к объекту
     * @param damage Величина урона
     */
    applyDamage(damage: number) {
        console.log(`[${this.node.name}] Применяем урон ${damage.toFixed(2)}, текущее здоровье: ${this.health}`);
        
        // Уменьшаем здоровье
        this.health -= damage;
        console.log(`[${this.node.name}] Новое здоровье после урона: ${this.health}`);
        
        // Воспроизводим звук удара - закомментировано для упрощения
        /*
        if (this.hitSound) {
            this.hitSound.play();
        }
        */

        // Если здоровье меньше порога повреждения и объект еще не поврежден
        if (!this._isDamaged && this.health <= this.damagedThreshold) {
            console.log(`[${this.node.name}] Здоровье ниже порога повреждения (${this.damagedThreshold}), меняем визуальное состояние`);
            this._isDamaged = true;
            this.onDamaged();
        }
        
        // Если здоровье закончилось, уничтожаем объект
        if (this.health <= 0 && !this._isDestroyed) {
            console.log(`[${this.node.name}] Здоровье равно или ниже нуля, уничтожаем объект`);
            this.destroyObject();
        }
    }

    /**
     * Вызывается, когда объект поврежден (достиг порога повреждения)
     */
    onDamaged() {
        // Переопределяется в наследниках
        // Например, чтобы сменить спрайт/модель на поврежденную
    }

    /**
     * Уничтожение объекта
     */
    destroyObject() {
        if (this._isDestroyed) return;
        
        this._isDestroyed = true;
        
        // Начисляем очки
        this.addScore();
        
        // Воспроизводим звук разрушения - закомментировано для упрощения
        /*
        if (this.destructionSound) {
            this.destructionSound.play();
        }
        */
        
        // // Воспроизводим эффект разрушения
        // this.playDestructionEffect();
        
        // Удаляем объект с задержкой
        this.scheduleOnce(() => {
            this.node.destroy();
        }, this.destroyDelay);
    }

    /**
     * Воспроизведение эффекта разрушения - закомментировано для упрощения
     */
    playDestructionEffect() {
        // Пустая реализация для упрощения тестирования
        // Раскомментируйте код ниже, когда будете готовы добавить эффекты
        /*
        if (this.destructionParticles) {
            this.destructionParticles.play();
        }
        
        if (this.destructionDebrisParticles) {
            this.destructionDebrisParticles.play();
        }
        */
    }

    /**
     * Начисление очков за разрушение
     */
    addScore() {
        // Получаем доступ к GameManager и начисляем очки
        // В этой базовой реализации мы отправим событие о начислении очков
        // GameManager будет перехватывать это событие
        this.node.emit('score-added', this.scoreValue);
    }
}
