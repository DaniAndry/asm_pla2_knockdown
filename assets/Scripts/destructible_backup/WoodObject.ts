import { _decorator, Component, Node, MeshRenderer, Material } from 'cc';
import { DestructibleObject, MaterialType } from './DestructibleObject';
const { ccclass, property } = _decorator;

/**
 * Класс для деревянных разрушаемых объектов
 */
@ccclass('WoodObject')
export class WoodObject extends DestructibleObject {
    @property([Material])
    damagedMaterials: Material[] = [];

    onLoad() {
        super.onLoad();
        
        // Устанавливаем тип материала
        this._materialType = MaterialType.Wood;
        
        // Настройки деревянного объекта
        this.health = 80;
        this.damageFactor = 1.2;
        this.scoreValue = 10;
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
        if (this.destructionParticles) {
            this.destructionParticles.play();
        }
        */
    }
}
