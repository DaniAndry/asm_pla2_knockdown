import { _decorator, Component, Camera, Vec3, isValid } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('BillboardText')
export class BillboardText extends Component {
    @property({ type: Camera, tooltip: 'Камера на которую смотрит объект' })
    targetCamera: Camera = null;

    @property({ tooltip: 'Автоматически найти главную камеру' })
    autoFindCamera: boolean = true;

    onLoad() {
        if (this.autoFindCamera && !isValid(this.targetCamera)) {
            this.targetCamera = this.node.scene?.getComponentInChildren(Camera) ?? null;
        }
    }

    update() {
        if (!isValid(this.targetCamera)) return;

        const cameraPos = this.targetCamera.node.worldPosition;
        this.node.lookAt(cameraPos);
    }
}
