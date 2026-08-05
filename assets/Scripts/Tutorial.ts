import { _decorator, Component, systemEvent, SystemEventType, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Tutorial')
export class Tutorial extends Component {
    @property({
        type: Node,
        tooltip: "Нода CannonController для отслеживания автовыстрела"
    })
    cannonControllerNode: Node = null;
    
    onLoad() {
        if (this.cannonControllerNode) {
            this.cannonControllerNode.on('projectile-launched', this.hideTutorial, this);
        }
        
        this.node.scene.on('projectile-launched', this.hideTutorial, this);
    }
    
    onEnable() {
        systemEvent.once(SystemEventType.TOUCH_START, this.onFirstTap, this);
    }

    private onFirstTap() {
        this.hideTutorial();
    }
    
    private hideTutorial() {
        this.node.active = false;
    }

    onDisable() {
        systemEvent.off(SystemEventType.TOUCH_START, this.onFirstTap, this);
        
        if (this.cannonControllerNode && this.cannonControllerNode.isValid) {
            this.cannonControllerNode.off('projectile-launched', this.hideTutorial, this);
        }
        
        if (this.node && this.node.scene) {
            this.node.scene.off('projectile-launched', this.hideTutorial, this);
        }
    }
}
