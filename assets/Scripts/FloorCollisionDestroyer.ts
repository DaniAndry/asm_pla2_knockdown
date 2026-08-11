import {
    _decorator,
    Component,
    Collider,
    ICollisionEvent,
} from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';
import { findComponentInParents } from './NodeUtils';

const { ccclass } = _decorator;

// Повесить ОДИН раз на сам объект "Floor" (на его Collider).
// Раньше каждый разрушаемый объект сам проверял в своём onCollisionEnter,
// не является ли то, что в него врезалось, полом (сравнение по имени/группе) —
// при плотном стеке из десятков объектов это лишняя проверка на каждое
// столкновение. Теперь это делает только сам Floor: одно столкновение — один
// вызов scheduleDestroyFromFloor() у того, что в него врезалось.
// ВАЖНО: у коллайдера на Floor должны быть включены collision-события
// (Collider -> Collision Events / Group & Mask настроены так, чтобы Floor
// реально получал onCollisionEnter от разрушаемых объектов).
@ccclass('FloorCollisionDestroyer')
export class FloorCollisionDestroyer extends Component {
    onLoad() {
        const collider = this.getComponent(Collider);
        if (collider) {
            collider.on('onCollisionEnter', this.onCollisionEnter, this);
        }
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
