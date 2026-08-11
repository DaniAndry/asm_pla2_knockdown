import {
    _decorator,
    RigidBody,
    Vec3,
    CCFloat,
    Node,
    director,
    Component
} from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';

const { ccclass, property } = _decorator;

@ccclass('ImpulseOnDestroy')
export class ImpulseOnDestroy extends UniversalCollisionHandler {
    @property({
        type: CCFloat,
        tooltip: 'Сила импульса, применяемого к другим объектам при уничтожении.'
    })
    public explosionImpulse: number = 100;

    @property({
        type: CCFloat,
        tooltip: 'Радиус, в пределах которого объекты будут получать импульс.'
    })
    public explosionRadius: number = 5;

    @property({
        type: CCFloat,
        tooltip: 'Насколько импульс будет поднимать объекты вверх.'
    })
    public explosionUplift: number = 0.2;

    destroySelf(fromFloor: boolean = false) {
        if (this.isDestroyed) return;

        this.applyExplosionImpulseManually();
        super.destroySelf(fromFloor);
    }

    applyExplosionImpulseManually() {
        if (!this.node || !this.node.scene) {
            console.warn("ImpulseOnDestroy: Node или сцена не готовы.");
            return;
        }

        const currentPosition = this.node.worldPosition;
        const explosionRadiusSqr = this.explosionRadius * this.explosionRadius;

        const scene = director.getScene();
        if (!scene) {
            console.warn("ImpulseOnDestroy: Сцена не получена.");
            return;
        }

        const rigidbodies = scene.getComponentsInChildren(RigidBody);

        if (!rigidbodies || rigidbodies.length === 0) {
            console.warn("ImpulseOnDestroy: В сцене нет RigidBody.");
            return;
        }

        for (const otherRb of rigidbodies) {
            const otherNode = otherRb.node;

            if (otherNode === this.node) continue;
            if (!otherRb.isValid || !otherNode.activeInHierarchy) continue;

            // Проверка инициализации физики (внутренняя переменная)
            const isInitialized = (otherRb as any)._isInitialized;
            if (!isInitialized) {
                console.warn(`ImpulseOnDestroy: ${otherNode.name} — RigidBody не инициализирован`);
                continue;
            }

            if (!otherRb.isDynamic) continue;

            const distanceSqr = Vec3.squaredDistance(currentPosition, otherNode.worldPosition);
            if (distanceSqr > explosionRadiusSqr) continue;

            const direction = new Vec3();
            Vec3.subtract(direction, otherNode.worldPosition, currentPosition);

            if (direction.lengthSqr() < 0.0001) {
                direction.set(Math.random() - 0.5, 0.5 + Math.random() * 0.5, Math.random() - 0.5);
            }

            direction.normalize();

            if (this.explosionUplift > 0) {
                direction.y = Math.max(direction.y, 0) + this.explosionUplift;
                direction.normalize();
            }

            const impulse = direction.multiplyScalar(this.explosionImpulse);

            // Безопасное применение импульса
            try {
                otherRb.applyImpulse(impulse);
                // console.log(`Импульс на ${otherNode.name}`);
            } catch (e) {
                console.warn(`ImpulseOnDestroy: Ошибка при применении импульса к ${otherNode.name}:`, e);
            }
        }
    }
}
