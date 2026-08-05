import {
    _decorator, Component, Node, Vec3, Vec2, Camera, RigidBody,
    input, Input, EventTouch, CCFloat, Quat,
    AudioClip, AudioSource, screen, MeshRenderer,
    PhysicsSystem, Animation, AnimationClip, Collider
} from 'cc';
import { LevelSwitcher } from './LevelSwitcher';
import { TrajectoryDrawer3D } from './TrajectoryDrawer3D';
const { ccclass, property } = _decorator;

const _tempVec3 = new Vec3();
const _tempQuat = new Quat();

@ccclass('CannonController')
export class CannonController extends Component {
    @property(Node) cannonBarrel: Node = null;
    @property(Node) cannonMuzzle: Node = null;
    @property(Node) projectile: Node = null;
    @property(Camera) camera: Camera = null;
    @property(Animation) cannonAnimation: Animation = null;
    @property(AnimationClip) shootAnimationClip: AnimationClip = null;
    @property(CCFloat) launchPower: number = 20;
    @property(CCFloat) minVerticalAngle: number = 0;
    @property(CCFloat) maxVerticalAngle: number = 60;
    @property(CCFloat) rotationSensitivity: number = 0.5;
    @property(CCFloat) fixedVerticalAngle: number = 30;
    @property(CCFloat) powerMultiplierRange: number = 0.5;
    @property({ tooltip: 'Включить управление по всему экрану' }) allowFullScreenControl: boolean = true;
    @property({ type: CCFloat, visible: function (this: any) { return !this.allowFullScreenControl; } })
    controlMinX: number = 0;
    @property({ type: CCFloat, visible: function (this: any) { return !this.allowFullScreenControl; } })
    controlMaxX: number = 1;
    @property(LevelSwitcher) levelSwitcher: LevelSwitcher = null;
    @property({ type: AudioClip }) launchSound: AudioClip = null;
    @property({ type: AudioSource }) audioSource: AudioSource = null;
    @property({ tooltip: 'Пауза между выстрелами при удержании (сек)' })
    fireHoldInterval: number = 0.3;

    private hasLaunched = false;
    private isPhysicsEnabled = false;
    private physicsDisableCallback: Function = null;
    private _trajectoryDrawerComponent: TrajectoryDrawer3D = null;
    private initialProjectilePosition: Vec3 = new Vec3();
    private targetClickPoint: Vec2 = null;
    private currentPowerMultiplier: number = 1.0;
    private currentHorizontalAngle: number = 0;
    private currentVerticalAngle: number = 0;
    private initialBarrelRotation: Quat = new Quat();

    // 🔹 автоматическая очередь
    private isFiringHeld: boolean = false;
    private fireLoopScheduled: boolean = false;

    // Стрелочные функции чтобы корректно снимать слушатели
    private _onVisibilityChange = () => {
        if (document.hidden) this.stopFiringLoop();
    };

    private _onWindowBlur = () => {
        this.stopFiringLoop();
    };

    onLoad() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

        // Сброс очереди при уходе со вкладки / потере фокуса окна
        document.addEventListener('visibilitychange', this._onVisibilityChange);
        window.addEventListener('blur', this._onWindowBlur);

        if (this.cannonBarrel) this.initialBarrelRotation.set(this.cannonBarrel.rotation);
        this.updateCannonRotation();
        this.enablePhysicsTemporarily(2);
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

        document.removeEventListener('visibilitychange', this._onVisibilityChange);
        window.removeEventListener('blur', this._onWindowBlur);

        if (this.physicsDisableCallback) {
            this.unschedule(this.physicsDisableCallback);
            this.physicsDisableCallback = null;
        }

        this.unscheduleAllCallbacks();
        const physicsSystem = PhysicsSystem.instance;
        if (physicsSystem) physicsSystem.enable = true;
    }

    public setProjectile(projectile: Node) {
        this.projectile = projectile;
        this.projectile.active = true;
        if (this.cannonMuzzle) this.projectile.setWorldPosition(this.cannonMuzzle.worldPosition);
        this.initialProjectilePosition.set(this.projectile.worldPosition);
        this.disableMeshesRecursively(this.projectile);

        const rb = this.projectile.getComponent(RigidBody);
        if (rb) {
            rb.enabled = true;
            rb.useGravity = false;
            rb.type = RigidBody.Type.KINEMATIC;
            rb.setLinearVelocity(Vec3.ZERO);
            rb.setAngularVelocity(Vec3.ZERO);
        }

        this.resetState();
        this._trajectoryDrawerComponent = this.projectile.getComponent(TrajectoryDrawer3D);
        if (this._trajectoryDrawerComponent) this._trajectoryDrawerComponent.clear();
    }

    private resetState() {
        this.hasLaunched = false;
    }

    public resetForNewLevel() {
        this.resetState();
        this.enablePhysicsTemporarily(2);
    }

    private updateCannonRotation() {
        if (!this.cannonBarrel) return;
        const deltaRotation = new Quat();
        Quat.fromEuler(deltaRotation, this.currentVerticalAngle, this.currentHorizontalAngle, 0);
        const finalRotation = new Quat();
        Quat.multiply(finalRotation, this.initialBarrelRotation, deltaRotation);
        this.cannonBarrel.setRotation(finalRotation);
    }

    private onTouchStart(event: EventTouch) {
        if (!this.projectile || !this.projectile.isValid) return;
        const touch = event.getLocation();

        if (!this.allowFullScreenControl) {
            const screenWidth = screen.windowSize.width;
            const normalizedX = touch.x / screenWidth;
            if (normalizedX < this.controlMinX || normalizedX > this.controlMaxX) return;
        }

        this.targetClickPoint = touch;
        this.aimAtScreenPoint(touch, event);

        // 🚀 включаем очередь
        this.isFiringHeld = true;
        this.startFiringLoop();
    }

    private onTouchMove(event: EventTouch) {
        if (this.isFiringHeld) {
            this.targetClickPoint = event.getLocation();
            this.aimAtScreenPoint(this.targetClickPoint, event);
        }
    }

    private onTouchEnd() {
        this.stopFiringLoop();
    }

    private startFiringLoop() {
        if (this.fireLoopScheduled) this.unschedule(this.fireLoopLogic);
        this.fireLoopScheduled = true;

        // первый выстрел сразу
        this.fireLoopLogic();

        // остальные — с интервалом
        this.schedule(this.fireLoopLogic, this.fireHoldInterval);
    }

    private stopFiringLoop() {
        this.isFiringHeld = false;
        if (this.fireLoopScheduled) {
            this.unschedule(this.fireLoopLogic);
            this.fireLoopScheduled = false;
        }
    }

    private fireLoopLogic = () => {
        if (!this.node.isValid || !this.isFiringHeld) return;
        if (this.projectile && !this.hasLaunched) this.launchProjectile();
    };

    private aimAtScreenPoint(screenPos: Vec2, event: EventTouch) {
        const screenWidth = screen.windowSize.width;
        const screenHeight = screen.windowSize.height;

        const touchPos = event.getLocation();
        const normalizedX = (touchPos.x / screenWidth - 0.5) * 2;
        const normalizedY = (touchPos.y / screenHeight - 0.5) * 2;

        const maxHorizontalAngle = 30;
        this.currentHorizontalAngle = normalizedX * maxHorizontalAngle;

        const minVert = this.minVerticalAngle;
        const maxVert = this.maxVerticalAngle;
        const t = (normalizedY + 1) / 2;
        this.currentVerticalAngle = minVert + (maxVert - minVert) * t;

        this.currentPowerMultiplier = 1.0 + normalizedY * this.powerMultiplierRange * 0.5;
        this.updateCannonRotation();
    }

    private getDirectionToClick(screenPos: Vec2): Vec3 {
        if (!this.camera || !this.cannonMuzzle) return new Vec3(0, 0, 1);
        const ray = this.camera.screenPointToRay(screenPos.x, screenPos.y);
        const targetPoint = new Vec3(ray.o.x + ray.d.x * 100, ray.o.y + ray.d.y * 100, ray.o.z + ray.d.z * 100);
        const muzzlePos = this.cannonMuzzle.worldPosition.clone();
        const direction = targetPoint.subtract(muzzlePos).normalize();
        direction.y += 0.05;
        return direction;
    }

    private launchProjectile(isAutoLaunch: boolean = false) {
        if (!this.projectile || !this.projectile.isValid || this.hasLaunched) return;
        const rb = this.projectile.getComponent(RigidBody);
        if (!rb) return;

        if (this.cannonMuzzle) this.projectile.worldPosition = this.cannonMuzzle.worldPosition;
        this.enablePhysics();
        this.enableMeshesRecursively(this.projectile);

        rb.enabled = true;
        rb.useGravity = true;
        rb.type = RigidBody.Type.DYNAMIC;
        rb.setLinearVelocity(Vec3.ZERO);
        rb.setAngularVelocity(Vec3.ZERO);

        const collider = this.projectile.getComponent(Collider);
        if (collider) collider.enabled = true;

        const direction = this.getDirectionToClick(this.targetClickPoint || new Vec2(screen.windowSize.width / 2, screen.windowSize.height / 2));
        const adjustedPower = this.launchPower * this.currentPowerMultiplier;
        const velocity = direction.multiplyScalar(adjustedPower);
        rb.setLinearVelocity(velocity);

        if (this._trajectoryDrawerComponent) this._trajectoryDrawerComponent.clear();

        this.hasLaunched = true;
        this.playLaunchSound();
        this.playShootAnimation();

        this.node.emit('projectile-launched');
        if (this.node.scene) this.node.scene.emit('projectile-launched', { isAuto: isAutoLaunch });
    }

    private playLaunchSound() {
        if (!this.launchSound || !this.audioSource) return;
        if (this.audioSource.node.active) {
            this.audioSource.stop();
            this.audioSource.clip = this.launchSound;
            this.audioSource.play();
        }
    }

    private playShootAnimation() {
        if (!this.cannonAnimation || !this.shootAnimationClip) return;
        this.cannonAnimation.stop();
        this.cannonAnimation.play(this.shootAnimationClip.name);
    }

    private disableMeshesRecursively(node: Node) {
        if (!node || !node.isValid) return;
        const meshRenderers = node.getComponents(MeshRenderer);
        meshRenderers.forEach(mesh => mesh.enabled = false);
        node.children.forEach(child => this.disableMeshesRecursively(child));
    }

    private enableMeshesRecursively(node: Node) {
        if (!node || !node.isValid) return;
        if (!node.active) node.active = true;
        const meshRenderers = node.getComponents(MeshRenderer);
        meshRenderers.forEach(mesh => mesh.enabled = true);
        node.children.forEach(child => this.enableMeshesRecursively(child));
    }

    private disablePhysics() {
        const physicsSystem = PhysicsSystem.instance;
        if (physicsSystem) {
            physicsSystem.enable = false;
            this.isPhysicsEnabled = false;
        }
    }

    private enablePhysics() {
        if (this.physicsDisableCallback) {
            this.unschedule(this.physicsDisableCallback);
            this.physicsDisableCallback = null;
        }
        if (!this.isPhysicsEnabled) {
            const physicsSystem = PhysicsSystem.instance;
            if (physicsSystem) {
                physicsSystem.enable = true;
                this.isPhysicsEnabled = true;
            }
        }
    }

    private enablePhysicsTemporarily(duration: number) {
        if (this.physicsDisableCallback) {
            this.unschedule(this.physicsDisableCallback);
            this.physicsDisableCallback = null;
        }
        const physicsSystem = PhysicsSystem.instance;
        if (physicsSystem) physicsSystem.enable = true;
        this.isPhysicsEnabled = true;
        this.physicsDisableCallback = () => {
            this.disablePhysics();
            this.physicsDisableCallback = null;
        };
        this.scheduleOnce(this.physicsDisableCallback, duration);
    }
}