import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Damageable')
export class Damageable extends Component {
    @property
    health: number = 100;

    applyDamage(amount: number) {
        this.health -= amount;
        if (this.health <= 0) {
            this.node.destroy();
        }
    }
}
