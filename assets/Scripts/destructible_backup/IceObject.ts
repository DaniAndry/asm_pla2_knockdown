import { _decorator, Component, Node, MeshRenderer, Material, ParticleSystem } from 'cc';
import { DestructibleObject, MaterialType } from './DestructibleObject';
const { ccclass, property } = _decorator;

/**
 * Класс для ледяных разрушаемых объектов
 */
@ccclass('IceObject')
export class IceObject extends DestructibleObject {
    @property([Material])
    damagedMaterials: Material[] = [];
    
    // @property(ParticleSystem)
    // crackParticles: ParticleSystem = null;

    onLoad() {
        super.onLoad();
        
        // Устанавливаем тип материала
        this._materialType = MaterialType.Ice;
        
        // Настройки ледяного объекта
        this.health = 60; // Лед менее прочный чем дерево
        this.damageFactor = 1.5; // Лед получает больше урона
        this.scoreValue = 15;
        this._damageInterval = 0.05; // Лед быстрее реагирует на удары
    }

    /**
     * Вызывается при повреждении объекта
     */
    onDamaged() {
        // Временно отключено для упрощения тестирования
        /*
        // Воспроизводим эффект трещин
        if (this.crackParticles) {
            this.crackParticles.play();
        }
        */
        
        if (this.damagedMaterials.length > 0) {
            const meshRenderer = this.getComponent(MeshRenderer);
            if (meshRenderer) {
                const damageLevel = Math.floor((1 - this.health / this._initialHealth) * this.damagedMaterials.length);
                if (damageLevel < this.damagedMaterials.length) {
                    meshRenderer.setMaterial(this.damagedMaterials[damageLevel], 0);
                }
            }
        }
    }
    
    /**
     * Переопределяем метод воспроизведения эффекта разрушения
     * Временно отключено для упрощения тестирования
     */
    playDestructionEffect() {
        // Вызов базового метода временно закомментирован
        // super.playDestructionEffect();
        
        // Дополнительная логика для льда - например, можно добавить эффект таяния
        // или звуки разбивающегося льда
    }
}
