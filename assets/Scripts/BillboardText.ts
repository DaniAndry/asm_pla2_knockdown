import { _decorator, Component, Camera, Vec3, isValid } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Заставляет 3D объект всегда смотреть на камеру (Billboard эффект)
 * Используется для 3D текстовых popup'ов
 */
@ccclass('BillboardText')
export class BillboardText extends Component {
    @property({ type: Camera, tooltip: 'Камера на которую смотрит объект' })
    targetCamera: Camera = null;

    @property({ tooltip: 'Автоматически найти главную камеру' })
    autoFindCamera: boolean = true;

    onLoad() {
        if (this.autoFindCamera && !isValid(this.targetCamera)) {
            this.targetCamera = Camera.main;
        }
    }

    update() {
        if (!isValid(this.targetCamera)) return;

        const cameraPos = this.targetCamera.node.worldPosition;
        this.node.lookAt(cameraPos);
    }
}
