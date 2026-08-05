import { _decorator, Canvas, Component, math, Node, Size, Sprite, SpriteFrame, UITransform, Vec3, Widget, WidgetComponent } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('AdaptiveItem')
export class AdaptiveItem extends Component
{
    @property([Node]) uiItems: Node[] = [];
    @property multiSizeHorizont = 1;
    @property multiSizeVertical = 1;

    start()
    {
        this.schedule(() => this.updateLayout(), 0.5);
        window.addEventListener("resize", this.updateLayout.bind(this));
    }

    updateItems()
    {

        let a = document.body.clientHeight / document.body.clientWidth;
        let scale = 1;

        if (a < 1)
        {
            scale = (a / 1.55) * this.multiSizeHorizont;
        }

        let scaleBGs = 1;

        if (a < 1.55)
        {
            scaleBGs = a / 1.55;
        }

        if (a > 2)
        {
            scaleBGs = a / 2;
        }

        if (a < 0.5)
        {
            scaleBGs *= (0.5 / a);
        }

        for (var index = 0; index < this.uiItems.length; index++)
        {
            this.uiItems[index].scale = new Vec3(scale, scale, scale);
            if(this.uiItems[index].name == 'PackShoot' && a<1 ){
                this.uiItems[index].scale = new Vec3(scale / 1.5, scale / 1.5, scale / 1.5);

            }
        }


    }

    updateLayout()
    {
        this.scheduleOnce(() => this.updateItems(), 0.05);
    }
}


