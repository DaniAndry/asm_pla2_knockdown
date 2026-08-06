import {
    _decorator,
    Component,
    Collider,
    ICollisionEvent
} from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';

const { ccclass } = _decorator;

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
        const handler = otherNode.getComponent(UniversalCollisionHandler);

        if (handler) {
            handler.scheduleDestroyFromFloor();
        }
    }
}
