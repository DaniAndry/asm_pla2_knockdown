import { _decorator, Component, Node, Vec3, Prefab, instantiate, NodePool, math, CCFloat, RigidBody } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Класс для управления обломками и эффектами разрушения
 */
@ccclass('DebrisManager')
export class DebrisManager extends Component {
    @property({ type: [Prefab], tooltip: 'Префабы обломков дерева' })
    woodDebrisPrefabs: Prefab[] = [];
    
    @property({ type: [Prefab], tooltip: 'Префабы обломков льда' })
    iceDebrisPrefabs: Prefab[] = [];
    
    @property({ type: [Prefab], tooltip: 'Префабы обломков камня' })
    stoneDebrisPrefabs: Prefab[] = [];
    
    @property({ type: [Prefab], tooltip: 'Префабы эффектов для свиней' })
    pigEffectsPrefabs: Prefab[] = [];
    
    @property({ type: [Prefab], tooltip: 'Префабы эффектов для птиц' })
    birdEffectsPrefabs: Prefab[] = [];

    @property({ type: CCFloat, tooltip: 'Время жизни обломков (секунды)' })
    debrisLifetime: number = 3;

    @property({ type: CCFloat, tooltip: 'Сила разброса обломков' })
    explosionForce: number = 5;
    
    @property({ type: CCFloat, tooltip: 'Размер пула объектов для каждого типа' })
    poolSize: number = 10;
    
    // Пулы для повторного использования объектов
    private _woodDebrisPool: NodePool[] = [];
    private _iceDebrisPool: NodePool[] = [];
    private _stoneDebrisPool: NodePool[] = [];
    private _pigEffectsPool: NodePool[] = [];
    private _birdEffectsPool: NodePool[] = [];
    
    // Синглтон
    private static _instance: DebrisManager = null;
    
    /** Получить текущий экземпляр DebrisManager */
    public static instance(): DebrisManager {
        return DebrisManager._instance;
    }

    onLoad() {
        // Инициализация синглтона
        DebrisManager._instance = this;
        
        // Инициализация пулов объектов
        this.initPools();
    }
    
    onDestroy() {
        // Удаляем синглтон
        if (DebrisManager._instance === this) {
            DebrisManager._instance = null;
        }
        
        // Очищаем пулы
        this.clearPools();
    }

    /**
     * Инициализация пулов объектов
     */
    private initPools() {
        // Инициализация пулов для дерева
        for (let i = 0; i < this.woodDebrisPrefabs.length; i++) {
            const pool = new NodePool();
            for (let j = 0; j < this.poolSize; j++) {
                const node = instantiate(this.woodDebrisPrefabs[i]);
                pool.put(node);
            }
            this._woodDebrisPool.push(pool);
        }
        
        // Инициализация пулов для льда
        for (let i = 0; i < this.iceDebrisPrefabs.length; i++) {
            const pool = new NodePool();
            for (let j = 0; j < this.poolSize; j++) {
                const node = instantiate(this.iceDebrisPrefabs[i]);
                pool.put(node);
            }
            this._iceDebrisPool.push(pool);
        }
        
        // Инициализация пулов для камня
        for (let i = 0; i < this.stoneDebrisPrefabs.length; i++) {
            const pool = new NodePool();
            for (let j = 0; j < this.poolSize; j++) {
                const node = instantiate(this.stoneDebrisPrefabs[i]);
                pool.put(node);
            }
            this._stoneDebrisPool.push(pool);
        }
        
        // Инициализация пулов для эффектов свиней
        for (let i = 0; i < this.pigEffectsPrefabs.length; i++) {
            const pool = new NodePool();
            for (let j = 0; j < this.poolSize; j++) {
                const node = instantiate(this.pigEffectsPrefabs[i]);
                pool.put(node);
            }
            this._pigEffectsPool.push(pool);
        }
        
        // Инициализация пулов для эффектов птиц
        for (let i = 0; i < this.birdEffectsPrefabs.length; i++) {
            const pool = new NodePool();
            for (let j = 0; j < this.poolSize; j++) {
                const node = instantiate(this.birdEffectsPrefabs[i]);
                pool.put(node);
            }
            this._birdEffectsPool.push(pool);
        }
    }

    /**
     * Очистка пулов объектов
     */
    private clearPools() {
        // Очистка пулов для дерева
        for (const pool of this._woodDebrisPool) {
            pool.clear();
        }
        
        // Очистка пулов для льда
        for (const pool of this._iceDebrisPool) {
            pool.clear();
        }
        
        // Очистка пулов для камня
        for (const pool of this._stoneDebrisPool) {
            pool.clear();
        }
        
        // Очистка пулов для эффектов свиней
        for (const pool of this._pigEffectsPool) {
            pool.clear();
        }
        
        // Очистка пулов для эффектов птиц
        for (const pool of this._birdEffectsPool) {
            pool.clear();
        }
    }

    /**
     * Создать эффект разрушения деревянного объекта
     * @param position Позиция эффекта
     * @param count Количество обломков
     */
    createWoodDebris(position: Vec3, count: number = 5) {
        this.createDebris(this._woodDebrisPool, this.woodDebrisPrefabs, position, count);
    }

    /**
     * Создать эффект разрушения ледяного объекта
     * @param position Позиция эффекта
     * @param count Количество обломков
     */
    createIceDebris(position: Vec3, count: number = 5) {
        this.createDebris(this._iceDebrisPool, this.iceDebrisPrefabs, position, count);
    }

    /**
     * Создать эффект разрушения каменного объекта
     * @param position Позиция эффекта
     * @param count Количество обломков
     */
    createStoneDebris(position: Vec3, count: number = 5) {
        this.createDebris(this._stoneDebrisPool, this.stoneDebrisPrefabs, position, count);
    }

    /**
     * Создать эффект разрушения свиньи
     * @param position Позиция эффекта
     * @param count Количество эффектов
     */
    createPigEffect(position: Vec3, count: number = 1) {
        this.createDebris(this._pigEffectsPool, this.pigEffectsPrefabs, position, count);
    }

    /**
     * Создать эффект разрушения птицы
     * @param position Позиция эффекта
     * @param count Количество эффектов
     */
    createBirdEffect(position: Vec3, count: number = 1) {
        this.createDebris(this._birdEffectsPool, this.birdEffectsPrefabs, position, count);
    }

    /**
     * Общий метод создания обломков
     * @param pools Пулы объектов
     * @param prefabs Префабы для создания новых объектов
     * @param position Позиция эффекта
     * @param count Количество обломков
     */
    private createDebris(pools: NodePool[], prefabs: Prefab[], position: Vec3, count: number) {
        if (!pools.length || !prefabs.length || count <= 0) return;
        
        for (let i = 0; i < count; i++) {
            // Выбираем случайный пул
            const poolIndex = Math.floor(math.random() * pools.length);
            const pool = pools[poolIndex];
            
            // Получаем объект из пула или создаем новый
            let debris: Node = null;
            if (pool.size() > 0) {
                debris = pool.get();
            } else {
                debris = instantiate(prefabs[poolIndex]);
            }
            
            // Устанавливаем позицию
            debris.worldPosition = position.clone();
            debris.parent = this.node;
            
            // Добавляем случайное смещение
            const offsetX = math.randomRange(-0.5, 0.5);
            const offsetY = math.randomRange(-0.5, 0.5);
            const offsetZ = math.randomRange(-0.5, 0.5);
            debris.worldPosition = new Vec3(
                position.x + offsetX,
                position.y + offsetY,
                position.z + offsetZ
            );
            
            // Если есть RigidBody, добавляем импульс
            const rb = debris.getComponent(RigidBody);
            if (rb) {
                const impulseX = math.randomRange(-this.explosionForce, this.explosionForce);
                const impulseY = math.randomRange(0, this.explosionForce * 2); // Больше вверх
                const impulseZ = math.randomRange(-this.explosionForce, this.explosionForce);
                rb.applyImpulse(new Vec3(impulseX, impulseY, impulseZ));
            }
            
            // Возвращаем объект в пул через заданное время
            this.scheduleOnce(() => {
                if (debris.isValid) {
                    pool.put(debris);
                }
            }, this.debrisLifetime);
        }
    }
}
