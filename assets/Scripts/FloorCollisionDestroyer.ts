import {
    _decorator,
    Component,
    Collider,
    BoxCollider,
    RigidBody,
    ICollisionEvent,
    isValid,
    Vec3,
} from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';
import { findComponentInParents } from './NodeUtils';

const { ccclass } = _decorator;

// Повесить ОДИН раз на сам объект "Floor" (на его Collider + RigidBody).
// Раньше каждый разрушаемый объект сам проверял в своём onCollisionEnter,
// не является ли то, что в него врезалось, полом (сравнение по имени/группе) —
// при плотном стеке из десятков объектов это лишняя проверка на каждое
// столкновение. Теперь это делает только сам Floor: одно столкновение — один
// вызов scheduleDestroyFromFloor() у того, что в него врезалось.
// ВАЖНО: у коллайдера на Floor должны быть включены collision-события.
@ccclass('FloorCollisionDestroyer')
export class FloorCollisionDestroyer extends Component {
    onLoad() {
        const collider = this.getComponent(Collider);
        if (collider) {
            collider.on('onCollisionEnter', this.onCollisionEnter, this);
        }

        // Group/Mask/Type задаются здесь в коде принудительно (а не только
        // через инспектор), чтобы не зависеть от того, что выставлено руками —
        // Floor должен физически сталкиваться и с обычными блоками (DEFAULT),
        // и с осколками (SHATTER_GROUP), поэтому маска — это ИХ ОБЕИХ группы.
        // Type = Static ОБЯЗАТЕЛЕН: у свежедобавленного RigidBody тип по
        // умолчанию Dynamic — с ним Floor подчиняется гравитации/импульсам и
        // улетает при первом же массовом ударе пирамиды.
        const rb = this.getComponent(RigidBody);
        if (isValid(rb)) {
            rb.type = RigidBody.Type.STATIC;
            rb.setGroup(UniversalCollisionHandler.GROUP_FLOOR);
            rb.setMask(UniversalCollisionHandler.GROUP_DEFAULT | UniversalCollisionHandler.GROUP_SHATTER);
        }

        UniversalCollisionHandler.setShatterFloorNode(this.node);
    }

    start() {
        UniversalCollisionHandler.setShatterFloorNode(this.node);
    }

    private readFloorTopY(): number {
        const box = this.getComponent(BoxCollider);
        if (box) {
            const local = new Vec3(
                box.center.x,
                box.center.y + box.size.y * 0.5,
                box.center.z,
            );
            const world = new Vec3();
            Vec3.transformMat4(world, local, this.node.worldMatrix);
            return world.y;
        }
        return this.node.worldPosition.y;
    }

    onDestroy() {
        const collider = this.getComponent(Collider);
        if (collider) {
            collider.off('onCollisionEnter', this.onCollisionEnter, this);
        }
    }

    onCollisionEnter(event: ICollisionEvent) {
        const otherNode = event.otherCollider.node;
        const handler = findComponentInParents(otherNode, UniversalCollisionHandler);

        if (handler) {
            handler.scheduleDestroyFromFloor();
        }
    }
}
