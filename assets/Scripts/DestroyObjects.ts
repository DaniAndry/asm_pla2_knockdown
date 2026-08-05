import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('DestroyObjects')
export class DestroyObjects extends Component {
    onEnable() {
        this.scheduleOnce(() => {
          
        }, 2);
    }
}
