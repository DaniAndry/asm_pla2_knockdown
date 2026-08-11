import { _decorator, Component, Node, Vec3, view, screen } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('AdaptiveItem')
export class AdaptiveItem extends Component {

    @property([Node])
    uiItems: Node[] = [];

    @property
    multiSizeHorizont = 1;

    @property
    multiSizeVertical = 1;

    private readonly _onResize = () => {
        this.updateLayout();
    };

    onLoad() {

        this.updateItems();

        screen.on('window-resize', this._onResize, this);
        screen.on('orientation-change', this._onResize, this);
        screen.on('fullscreen-change', this._onResize, this);
    }

    onDestroy() {
        screen.off('window-resize', this._onResize, this);
        screen.off('orientation-change', this._onResize, this);
        screen.off('fullscreen-change', this._onResize, this);

        this.unscheduleAllCallbacks();
    }

    private updateLayout() {
        this.unscheduleAllCallbacks();

        this.scheduleOnce(() => {
            if (!this.isValid || !this.enabledInHierarchy) {
                return;
            }

            this.updateItems();
        }, 0.02);
    }

    private updateItems() {

        const visibleSize = view.getVisibleSize();



        const a = visibleSize.height / visibleSize.width;

        let scale = 1;

        if (a < 1) {
            scale = (a / 1.55) * this.multiSizeHorizont;
        }

        for (const item of this.uiItems) {

            if (!item || !item.isValid) {
                continue;
            }

            let itemScale = scale;

            if (item.name === 'PackShoot' && a < 1) {
                itemScale /= 1.5;
            }

            item.setScale(itemScale, itemScale, itemScale);
        }
    }
}