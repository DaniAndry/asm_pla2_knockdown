import {
    _decorator, Component,RigidBody,
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('ProjectileCCD')
export class ProjectileCCD extends Component {

private rb: RigidBody | null = null;

onLoad() {

    this.rb = this.getComponent(RigidBody);
    this.rb.useCCD = true;
    }

    onEnable() {
    }

    }
