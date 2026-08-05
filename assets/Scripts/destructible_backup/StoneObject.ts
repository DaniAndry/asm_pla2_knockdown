import { _decorator, Component, Node, MeshRenderer, Material } from 'cc';
import { DestructibleObject, MaterialType } from './DestructibleObject';
const { ccclass, property } = _decorator;

/**
 * Класс для каменных разрушаемых объектов
 */
@ccclass('StoneObject')
export class StoneObject extends DestructibleObject {
    @property([Material])
    damagedMaterials: Material[] = [];

    onLoad() {
        super.onLoad();
        
        // Устанавливаем тип материала
        this._materialType = MaterialType.Stone;
        
        // Настройки каменного объекта
        this.health = 150; // Камень прочнее других материалов
        this.damageFactor = 0.8; // Камень получает меньше урона
        this.scoreValue = 30; // Больше очков за разрушение
        this._damageInterval = 0.15; // Камень медленнее реагирует на удары
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
    }
}
