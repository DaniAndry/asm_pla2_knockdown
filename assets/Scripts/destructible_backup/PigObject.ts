import { _decorator, Component, Node, MeshRenderer, Material, Animation, find, CCFloat, director } from 'cc';
import { DestructibleObject, MaterialType } from './DestructibleObject';
const { ccclass, property } = _decorator;

/**
 * Класс для свиней (главных врагов)
 */
@ccclass('PigObject')
export class PigObject extends DestructibleObject {
    @property([Material])
    damagedMaterials: Material[] = [];
    
    // Временно отключено для упрощения тестирования
    // @property(Material)
    // scaredMaterial: Material = null;
    
    // @property(CCFloat)
    // scaredDuration: number = 1.0;
    
    // @property(Animation)
    // pigAnimation: Animation = null;

    private _isScared: boolean = false;
    private _scaredTimeout: number = null;

    onLoad() {
        super.onLoad();
        
        // Устанавливаем тип материала
        this._materialType = MaterialType.Pig;
        
        // Настройки свиньи
        this.health = 70;
        this.damageFactor = 1.3;
        this.scoreValue = 50; // Больше очков за уничтожение свиньи
        this._damageInterval = 0.1;
    }

    /**
     * Вызывается при повреждении объекта
     */
    onDamaged() {
        if (this.damagedMaterials.length > 0) {
            const meshRenderer = this.getComponent(MeshRenderer);
            if (meshRenderer) {
                const damageLevel = Math.floor((1 - this.health / this._initialHealth) * this.damagedMaterials.length);
                if (damageLevel < this.damagedMaterials.length) {
                    meshRenderer.setMaterial(this.damagedMaterials[damageLevel], 0);
                }
            }
        }
        
        // Временно отключено для упрощения тестирования
        /*
        // Если свинья испугана, запускаем анимацию испуга
        this.showScared();
        
        // Если у свиньи мало здоровья, воспроизводим анимацию
        if (this.health < this._initialHealth * 0.3) {
            if (this.pigAnimation) {
                this.pigAnimation.play('pig_shake');
            }
        }
        */
    }

    /**
     * Показать испуг свиньи
     * Временно отключено для упрощения тестирования
     */
    showScared() {
        // Пустая реализация для упрощения тестирования
        /*
        if (this._isScared) return;
        
        this._isScared = true;
        
        // Устанавливаем испуганный материал
        if (this.scaredMaterial) {
            const meshRenderer = this.getComponent(MeshRenderer);
            if (meshRenderer) {
                // Запоминаем текущий материал
                const originalMaterial = meshRenderer.getMaterial(0);
                
                // Устанавливаем испуганный
                meshRenderer.setMaterial(this.scaredMaterial, 0);
                
                // Восстанавливаем через некоторое время
                if (this._scaredTimeout) {
                    clearTimeout(this._scaredTimeout);
                }
                
                this._scaredTimeout = setTimeout(() => {
                    if (meshRenderer && this.health > 0) {
                        meshRenderer.setMaterial(originalMaterial, 0);
                    }
                    this._isScared = false;
                }, 1000) as unknown as number;
            }
        }
        */
    }
    
    /**
     * Переопределяем метод уничтожения
     */
    destroyObject() {
        // Проверяем условия для окончания уровня перед уничтожением
        const isLastPig = this.isLastPig();
        
        // Продолжаем обычное уничтожение
        super.destroyObject();
        
        // Если это последняя свинья, отправляем событие о победе
        if (isLastPig) {
            this.node.emit('level-completed', true);
        }
    }
    
    /**
     * Проверка, является ли эта свинья последней на уровне
     */
    private isLastPig(): boolean {
        // Ищем родительский контейнер свиней
        let pigsContainer = this.node.parent;
        while (pigsContainer && pigsContainer.name !== 'Pigs' && pigsContainer.parent) {
            pigsContainer = pigsContainer.parent;
        }
        
        // Если нашли родительский контейнер
        if (pigsContainer) {
            // Проверяем, сколько активных свиней осталось
            let activePigs = 0;
            for (let i = 0; i < pigsContainer.children.length; i++) {
                const child = pigsContainer.children[i];
                if (child !== this.node && child.active) {
                    const pigComponent = child.getComponent(PigObject);
                    if (pigComponent && !pigComponent._isDestroyed) {
                        activePigs++;
                    }
                }
            }
            
            return activePigs === 0;
        }
        
        return false;
    }
}
