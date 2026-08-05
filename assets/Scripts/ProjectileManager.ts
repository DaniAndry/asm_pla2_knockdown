import {
    _decorator,
    Component,
    Node,
    Vec3,
        Label,
    MeshRenderer,
    Animation
} from 'cc';
import { CannonController } from './CannonController';
const { ccclass, property } = _decorator;

@ccclass('ProjectileManager')
export class ProjectileManager extends Component {
    @property(Node) activeProjectile: Node = null;
    @property([Node]) reserveProjectiles: Node[] = [];
    @property(Node) projectileSpawnPoint: Node = null;

    @property(Node) projectileCountLabel: Node = null;

    // Визуальные индикаторы (иконки бомб)
    @property([Node])
    visualIndicators: Node[] = [];

    private cannon: CannonController = null;
    private projectiles: Node[] = [];
    private currentIndex: number = 0;

    onLoad() {
        this.cannon = this.getComponent(CannonController);
        if (!this.cannon || !this.projectileSpawnPoint) {

            return;
        }

        // Подписки
        this.cannon.node.on('projectile-launched', this.onProjectileLaunched, this);

        // 🔹 Подписка на смену уровня (без прямого LevelSwitcher)
        if (this.node.scene) {
            this.node.scene.on('level-switched', this.onLevelSwitched, this);
        }

        // Собираем список снарядов
        this.projectiles = [this.activeProjectile, ...this.reserveProjectiles];


        this.hideAllMeshesExceptFirst();
        this.setActiveProjectile(0);
        this.updateProjectileCountLabel();
        this.playAllIndicatorsOn();
    }

    onDestroy() {
        if (this.cannon && this.cannon.node) {
            this.cannon.node.off('projectile-launched', this.onProjectileLaunched, this);
        }
        if (this.node.scene) {
            this.node.scene.off('level-switched', this.onLevelSwitched, this);
        }
    }

    // === МЕШИ ===
    private hideAllMeshesExceptFirst() {
        this.projectiles.forEach((projectile, index) => {
            if (!projectile || !projectile.isValid) return;
            const meshes = projectile.getComponentsInChildren(MeshRenderer);
            for (const mesh of meshes) mesh.enabled = index === 0;
        });
    }

    private hideAllMeshes() {
        this.projectiles.forEach(projectile => {
            if (!projectile || !projectile.isValid) return;
            const meshes = projectile.getComponentsInChildren(MeshRenderer);
            for (const mesh of meshes) mesh.enabled = true;
        });
    }

    private showMeshesForActiveProjectile() {
        if (!this.activeProjectile || !this.activeProjectile.isValid) return;
        const meshes = this.activeProjectile.getComponentsInChildren(MeshRenderer);
        for (const mesh of meshes) mesh.enabled = true;
    }

    // === ОСНОВНАЯ ЛОГИКА ===
    private onProjectileLaunched() {
        this.currentIndex++;
        this.updateProjectileCountLabel();
        this.playIndicatorOff(this.currentIndex - 1);
        this.showMeshesForActiveProjectile();

        if (this.node.scene) this.node.scene.emit('projectile-fired');

        if (this.currentIndex >= this.projectiles.length) {

            if (this.node.scene) this.node.scene.emit('projectiles-finished');
            this.scheduleOnce(() => {
                if (this.node.scene) this.node.scene.emit('request-next-level');
            }, 3.0);
        } else {
            this.scheduleOnce(() => this.prepareNextProjectile(), 0.1);
        }
    }

    private prepareNextProjectile() {
        const nextProjectile = this.projectiles[this.currentIndex];
        if (!nextProjectile || !nextProjectile.isValid) {

            return;
        }

        nextProjectile.active = true;
        nextProjectile.setWorldPosition(this.projectileSpawnPoint.worldPosition);
        nextProjectile.eulerAngles = new Vec3(0, 0, 0);
        this.hideAllMeshes();
        this.setActiveProjectile(this.currentIndex);

        const meshes = this.activeProjectile.getComponentsInChildren(MeshRenderer);
        for (const mesh of meshes) mesh.enabled = false;
    }

    private setActiveProjectile(index: number) {
        if (index < 0 || index >= this.projectiles.length) return;
        const projectile = this.projectiles[index];
        if (!projectile || !projectile.isValid) return;
        this.activeProjectile = projectile;

        this.cannon.setProjectile(this.activeProjectile);
    }

    private updateProjectileCountLabel() {
        const label = this.projectileCountLabel?.getComponent(Label);
        const remaining = Math.max(this.projectiles.length - this.currentIndex, 0);
        if (label) label.string = `${remaining}`;
    }

    // === ИНДИКАТОРЫ ===
    private playIndicatorOff(index: number) {
        if (index < 0 || index >= this.visualIndicators.length) return;
        const node = this.visualIndicators[index];
        if (!node || !node.isValid) return;
        const anim = node.getComponent(Animation);
        if (anim && anim.getState('BombOff')) {
            anim.play('BombOff');
            anim.once(Animation.EventType.FINISHED, () => {
                this.scheduleOnce(() => {
                    if (node && node.isValid) node.active = false;
                }, 0.2);
            });
        } else {
            node.active = false;
        }
    }

    private playAllIndicatorsOn() {
        for (const node of this.visualIndicators) {
            if (!node || !node.isValid) continue;
            const anim = node.getComponent(Animation);
            if (anim && anim.getState('BombOn')) anim.play('BombOn');
            else node.active = true;
        }
    }

    private onLevelSwitched() {

        this.currentIndex = 0;
        this.updateProjectileCountLabel();

        if (this.cannon) this.cannon.resetForNewLevel();

        // скрываем все меши, кроме первого снаряда
        this.hideAllMeshesExceptFirst();
        this.setActiveProjectile(0);

        // включаем визуальные индикаторы с анимацией
        for (const node of this.visualIndicators) {
            if (!node || !node.isValid) continue;
            node.active = true; // обязательно включаем ноду
            const anim = node.getComponent(Animation);
            if (anim && anim.getState('BombOn')) {
                anim.stop();
                anim.play('BombOn'); // включаем NodeOn-анимацию
            } else {
                node.active = true; // если анимации нет, просто включаем
            }
        }

    }

}
