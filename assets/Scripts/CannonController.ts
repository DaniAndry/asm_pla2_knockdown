import {
    _decorator, Component, Node, Vec3, Vec2, Camera, RigidBody,
    input, Input, EventTouch, CCFloat, Quat,
    screen, MeshRenderer,
    PhysicsSystem, Animation, AnimationClip, Collider, isValid, geometry
} from 'cc';
import { LevelSwitcher } from './LevelSwitcher';
import { TrajectoryDrawer3D } from './TrajectoryDrawer3D';
import { SoundManager } from './SoundManager';
import { SpecialShotController } from './SpecialShotController';
import { ProjectileCCD } from './ProjectileCCD';
const { ccclass, property } = _decorator;

const _tempVec3 = new Vec3();
const _tempQuat = new Quat();

@ccclass('CannonController')
export class CannonController extends Component {
    @property(Node) cannonBarrel: Node = null;
    @property(Node) cannonMuzzle: Node = null;
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
    @property({ tooltip: 'Имя записи в SoundManager для звука выстрела' })
    launchSoundName: string = 'Shoot';
    @property({ tooltip: 'Пауза между выстрелами при удержании (сек)' })
    fireHoldInterval: number = 0.3;
    @property({ tooltip: 'Сколько секунд дать стеку осесть, затем заморозить физику до первого выстрела' })
    settleDuration: number = 1.2;

    @property({
        type: SpecialShotController,
        tooltip: 'Контроллер спецвыстрелов (картечь / ракета). Пока его isSpecialShoot выключен, пушка стреляет как обычно и этот компонент не вмешивается.'
    })
    specialShot: SpecialShotController = null;

    @property({
        tooltip: 'ВКЛ = снаряд летит по прямой ровно в точку нажатия: гравитация на него не действует, и подъём прицела не компенсируется. ВЫКЛ = обычная навесная траектория с падением.'
    })
    flatShot: boolean = true;

    @property({
        tooltip: 'Целиться лучом в реальную геометрию: снаряд полетит ровно в тот объект, по которому кликнули. Выключите, только если луч по каким-то причинам мешает — тогда прицел пойдёт по плоскости Aim Plane Z.'
    })
    useRaycastAim: boolean = true;

    @property({
        type: CCFloat,
        tooltip: 'Z вертикальной плоскости прицеливания — запасной вариант, когда игрок целится мимо всех объектов. Ставьте примерно на глубину пирамиды.'
    })
    aimPlaneZ: number = -18;

    @property({ type: CCFloat, tooltip: 'Максимальная дальность луча прицеливания' })
    aimMaxDistance: number = 200;

    @property({ tooltip: 'Подстрока в имени, по которой узел считается своим снарядом и не берётся как цель прицеливания' })
    projectileHitTag: string = 'Projectile';

    @property({
        tooltip: 'ВЫКЛ = не замораживать стек в Kinematic перед выстрелом, а положиться на штатный сон физики. Заморозка писалась когда sleepThreshold был 0 и тела не засыпали НИКОГДА — она была костылём вместо сна. Сейчас сон работает, и заморозка вредит: unfreeze при каждом выстреле будит все 400+ тел разом, после чего они заново оседают и засыпают, сжигая солвер. Спящее тело так же неподвижно, но дешевле и не требует массового пробуждения.'
    })
    usePreShotFreeze: boolean = true;

    private hasLaunched = false;
    private projectile: Node = null;

    private physicsUnlocked = false;

    private settleToken: number = 0;

    private frozenBodies: RigidBody[] = [];
    private _trajectoryDrawerComponent: TrajectoryDrawer3D = null;
    private initialProjectilePosition: Vec3 = new Vec3();
    private targetClickPoint: Vec2 = null;
    private currentPowerMultiplier: number = 1.0;
    private currentHorizontalAngle: number = 0;
    private currentVerticalAngle: number = 0;
    private initialBarrelRotation: Quat = new Quat();


    private isFiringHeld: boolean = false;
    private fireLoopScheduled: boolean = false;


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


        document.addEventListener('visibilitychange', this._onVisibilityChange);
        window.addEventListener('blur', this._onWindowBlur);

        if (this.node.scene) {
            this.node.scene.on('gameplay-input-blocked', this.onGameplayInputBlocked, this);
        }

        if (this.cannonBarrel) this.initialBarrelRotation.set(this.cannonBarrel.rotation);
        this.updateCannonRotation();
        this.beginPreShotPhysicsHold();
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

        document.removeEventListener('visibilitychange', this._onVisibilityChange);
        window.removeEventListener('blur', this._onWindowBlur);

        if (this.node.scene) {
            this.node.scene.off('gameplay-input-blocked', this.onGameplayInputBlocked, this);
        }

        this.settleToken++;
        this.unscheduleAllCallbacks();
        this.ensurePhysicsWorldEnabled();
        this.unfreezePhysics();
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

        const collider = this.projectile.getComponent(Collider);
        if (collider) collider.enabled = true;

        this.resetState();
        this._trajectoryDrawerComponent = this.projectile.getComponent(TrajectoryDrawer3D);
        if (this._trajectoryDrawerComponent) {
            // Предпросмотр должен совпадать с реальным полётом: при прямом
            // выстреле траектория — прямая, поэтому гравитацию в рисовальщике
            // тоже обнуляем, иначе линия будет провисать, а снаряд полетит ровно.
            if (this.flatShot) this._trajectoryDrawerComponent.gravity = 0;
            this._trajectoryDrawerComponent.clear();
        }
    }

    public clearProjectile() {
        this.projectile = null;
        this.hasLaunched = true;
        this._trajectoryDrawerComponent = null;
    }

    private resetState() {
        this.hasLaunched = false;
    }

    public resetForNewLevel() {
        this.resetState();
        this.beginPreShotPhysicsHold();
    }

    private updateCannonRotation() {
        if (!this.cannonBarrel) return;
        const deltaRotation = new Quat();
        Quat.fromEuler(deltaRotation, this.currentVerticalAngle, this.currentHorizontalAngle, 0);
        const finalRotation = new Quat();
        Quat.multiply(finalRotation, this.initialBarrelRotation, deltaRotation);
        this.cannonBarrel.setRotation(finalRotation);
    }

    private onGameplayInputBlocked = () => {
        this.stopFiringLoop();
    };

    private isShootingBlocked(): boolean {
        const switcher = this.resolveLevelSwitcher();
        return isValid(switcher) && switcher.isShootingBlocked();
    }

    private resolveLevelSwitcher(): LevelSwitcher | null {
        if (isValid(this.levelSwitcher)) return this.levelSwitcher;
        const scene = this.node.scene;
        if (!isValid(scene)) return null;
        const found = scene.getComponentInChildren(LevelSwitcher);
        if (isValid(found)) this.levelSwitcher = found;
        return found;
    }

    private onTouchStart(event: EventTouch) {

        SoundManager.markFirstTouch();

        if (this.isShootingBlocked()) return;
        if (isValid(this.specialShot) && this.specialShot.blocksAimTouch(event)) return;

        const touch = event.getLocation();

        if (!this.allowFullScreenControl) {
            const screenWidth = screen.windowSize.width;
            const normalizedX = touch.x / screenWidth;
            if (normalizedX < this.controlMinX || normalizedX > this.controlMaxX) return;
        }



        this.unlockPhysicsForGameplay();

        if (!this.projectile || !this.projectile.isValid) return;

        this.targetClickPoint = touch;
        this.aimAtScreenPoint(touch, event);


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


        this.fireLoopLogic();


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
        if (this.isShootingBlocked()) {
            this.stopFiringLoop();
            return;
        }
        if (this.projectile && !this.hasLaunched) this.launchProjectile();
    };

    private aimAtScreenPoint(screenPos: Vec2, event: EventTouch) {
        const screenWidth = screen.windowSize.width;
        const screenHeight = screen.windowSize.height;

        const touchPos = event.getLocation();
        const normalizedX = (touchPos.x / screenWidth - 0.5) * 2;
        const normalizedY = (touchPos.y / screenHeight - 0.5) * 2;

        const maxHorizontalAngle = 30;
        this.currentHorizontalAngle = -normalizedX * maxHorizontalAngle;

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
        const muzzlePos = this.cannonMuzzle.worldPosition.clone();

        const target = this.resolveAimPoint(ray);

        const direction = target.subtract(muzzlePos).normalize();

        if (!this.flatShot) {
            direction.y += 0.05;
            direction.normalize();
        }
        return direction;
    }

    private resolveAimPoint(ray: geometry.Ray): Vec3 {
        if (this.useRaycastAim) {
            const ps = PhysicsSystem.instance;
            if (ps && ps.raycastClosest(ray, 0xffffffff, this.aimMaxDistance, false)) {
                const r = ps.raycastClosestResult;
                const hitNode = r?.collider?.node;

                // Свой же снаряд, висящий у дула, целью быть не может.
                const isSelf = isValid(hitNode) && (
                    hitNode === this.projectile ||
                    (isValid(this.projectile) && hitNode.parent === this.projectile) ||
                    (this.projectileHitTag && hitNode.name.indexOf(this.projectileHitTag) >= 0)
                );

                if (!isSelf && r?.hitPoint) return r.hitPoint.clone();
            }
        }

        // Запасной вариант: пересечение с вертикальной плоскостью Z = aimPlaneZ.
        // Он нужен, когда игрок целится в пустоту мимо пирамиды.
        const dz = ray.d.z;
        if (Math.abs(dz) > 1e-4) {
            const t = (this.aimPlaneZ - ray.o.z) / dz;
            if (t > 0) {
                return new Vec3(ray.o.x + ray.d.x * t, ray.o.y + ray.d.y * t, this.aimPlaneZ);
            }
        }

        // Совсем крайний случай — старое поведение с далёкой точкой.
        return new Vec3(
            ray.o.x + ray.d.x * this.aimMaxDistance,
            ray.o.y + ray.d.y * this.aimMaxDistance,
            ray.o.z + ray.d.z * this.aimMaxDistance
        );
    }

    private launchProjectile(isAutoLaunch: boolean = false) {
        if (this.isShootingBlocked()) return;
        if (!this.projectile || !this.projectile.isValid || this.hasLaunched) return;
        const rb = this.projectile.getComponent(RigidBody);
        if (!rb) return;

        if (this.cannonMuzzle) this.projectile.worldPosition = this.cannonMuzzle.worldPosition;
        this.unlockPhysicsForGameplay();
        this.enableMeshesRecursively(this.projectile);

        rb.enabled = true;
        // Прямой выстрел: гравитация на снаряд не действует, поэтому он летит
        // ровно в ту точку, куда прицелились, без просадки по дуге.
        rb.useGravity = !this.flatShot;
        rb.type = RigidBody.Type.DYNAMIC;
        rb.setLinearVelocity(Vec3.ZERO);
        rb.setAngularVelocity(Vec3.ZERO);

        const collider = this.projectile.getComponent(Collider);
        if (collider) collider.enabled = true;

        const direction = this.getDirectionToClick(this.targetClickPoint || new Vec2(screen.windowSize.width / 2, screen.windowSize.height / 2));
        const adjustedPower = this.launchPower * this.currentPowerMultiplier;

        // Спецвыстрел (картечь / ракета). Спрашиваем ДО того, как обычный
        // снаряд получит скорость: если режим активен, он сам создаёт свои
        // снаряды, а штатный мы прячем — иначе полетят и те и другой.
        // direction передаём копией: ниже он домножается на скорость на месте.
        if (isValid(this.specialShot) && this.specialShot.isSpecialShoot) {
            const muzzlePos = this.cannonMuzzle ? this.cannonMuzzle.worldPosition : this.projectile.worldPosition;
            // Спецснаряды летят по тем же правилам, что и обычный: если выстрел
            // прямой, гравитация не должна тянуть вниз ни картечь, ни ракету.
            this.specialShot.useGravity = !this.flatShot;
            const handled = this.specialShot.fireSpecial(muzzlePos, direction.clone(), adjustedPower);

            if (handled) {
                this.hideStandardProjectile(rb, collider);
                if (this._trajectoryDrawerComponent) this._trajectoryDrawerComponent.clear();

                this.hasLaunched = true;
                this.playShootAnimation();
                this.node.emit('projectile-launched');
                if (this.node.scene) this.node.scene.emit('projectile-launched', { isAuto: isAutoLaunch });
                return;
            }
        }

        const velocity = direction.multiplyScalar(adjustedPower);
        // CCD-флаг нужно выставить ДО скорости: запись useCCD после
        // setLinearVelocity на вращающемся уровне обнуляет скорость,
        // и снаряд дёргается у дула, так и не улетев.
        const ccd = this.projectile.getComponent(ProjectileCCD);
        if (isValid(ccd)) ccd.applyForLaunch();
        rb.setLinearVelocity(velocity);

        if (this._trajectoryDrawerComponent) this._trajectoryDrawerComponent.clear();

        this.hasLaunched = true;
        this.playLaunchSound();
        this.playShootAnimation();

        this.node.emit('projectile-launched');
        if (this.node.scene) this.node.scene.emit('projectile-launched', { isAuto: isAutoLaunch });
    }

    /**
     * Штатный снаряд при спецвыстреле не летит: гасим ему физику и меши,
     * чтобы он не висел в воздухе у дула и ни во что не врезался. Сам узел не
     * уничтожаем — им распоряжается ProjectileManager, который считает
     * боезапас и переиспользует объект.
     */
    private hideStandardProjectile(rb: RigidBody, collider: Collider | null) {
        try {
            rb.setLinearVelocity(Vec3.ZERO);
            rb.setAngularVelocity(Vec3.ZERO);
        } catch { }
        rb.enabled = false;
        if (collider) collider.enabled = false;
        this.disableMeshesRecursively(this.projectile);
    }

    private playLaunchSound() {
        if (!this.launchSoundName) return;
        SoundManager.playOneShot(this.launchSoundName);
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


    private beginPreShotPhysicsHold() {
        this.physicsUnlocked = false;
        SoundManager.disableHits();
        this.ensurePhysicsWorldEnabled();
        this.unfreezePhysics();

        const token = ++this.settleToken;
        const duration = Math.max(0, this.settleDuration);
        if (duration <= 0) {
            this.freezePhysics();
            return;
        }

        this.scheduleOnce(() => {
            if (token !== this.settleToken || this.physicsUnlocked) return;
            this.freezePhysics();
        }, duration);
    }


    private unlockPhysicsForGameplay() {
        this.physicsUnlocked = true;
        this.settleToken++;
        SoundManager.enableHits();
        this.ensurePhysicsWorldEnabled();
        this.unfreezePhysics();
    }

    private ensurePhysicsWorldEnabled() {
        const physicsSystem = PhysicsSystem.instance;
        if (!physicsSystem) return;
        physicsSystem.enable = true;

        // autoSimulation здесь НЕ трогаем. Раньше тут стояло
        // `autoSimulation = true`, и это конфликтовало с PhysicsBootstrap,
        // который выставляет autoSimulation = false и сам шагает физику
        // вручную в update() через ps.simulate() с зажатой дельтой.
        // В итоге мир продвигался ДВА раза за кадр: один раз встроенным
        // автошагом движка, второй — нашим ручным вызовом. Двойной шаг ломает
        // устойчивость стека (двойная гравитация и двойной проход солвера за
        // кадр), объекты постоянно микро-дёргаются, не могут устояться и
        // из-за этого никогда не засыпают — сколько ни поднимай
        // sleepThreshold и ни включай Allow Sleep.
        // Режимом симуляции владеет только PhysicsBootstrap.
    }


    private forEachGameplayBody(fn: (rb: RigidBody) => void) {
        const scene = this.node.scene;
        if (!isValid(scene)) return;

        let bodies: RigidBody[];
        try {
            bodies = scene.getComponentsInChildren(RigidBody);
        } catch {
            // Сцена может быть в процессе разрушения — например, "Try Again"
            // в LevelSwitcher перезагружает сцену, и наш собственный
            // onDestroy() вызывает unfreezePhysics() -> forEachGameplayBody()
            // прямо посреди этого процесса. В этот момент isValid(scene) уже
            // может быть true, но часть дерева сцены физически разобрана
            // (у некоторых узлов _children == null), и getComponentsInChildren()
            // падает с "Cannot read properties of null (reading 'length')".
            // Раньше это было необработанным исключением прямо внутри
            // onDestroy() — оно прерывало остальной каскад разрушения сцены
            // на середине и, судя по всему, приводило следом к Error 5000
            // (destroy object twice). Если сцена всё равно разрушается —
            // размораживать в ней уже нечего, просто выходим.
            return;
        }

        for (const rb of bodies) {
            if (!isValid(rb) || !rb.enabled) continue;
            if (!rb.node?.activeInHierarchy) continue;
            if (!rb.useGravity) continue;
            // Static-тела (Floor и любая другая неподвижная геометрия) —
            // не "геймплейные" тела пирамиды и никогда не должны попадать
            // под freeze/unfreeze-цикл. Раньше unfreezePhysics() безусловно
            // выставлял ЛЮБОМУ подошедшему под фильтр телу Type.DYNAMIC —
            // Floor проходил фильтр (enabled, активен, useGravity не
            // выключен) и на каждый выстрел заново становился Dynamic,
            // хотя freezePhysics() его туда никогда не замораживал.
            if (rb.type === RigidBody.Type.STATIC) continue;
            fn(rb);
        }
    }

    private freezePhysics() {
        this.frozenBodies.length = 0;
        if (!this.usePreShotFreeze) return;

        this.forEachGameplayBody((rb) => {
            try {
                if (!(rb as any)._isInitialized) return;
                if (!rb.isDynamic) return;

                rb.setLinearVelocity(Vec3.ZERO);
                rb.setAngularVelocity(Vec3.ZERO);
                rb.type = RigidBody.Type.KINEMATIC;
                this.frozenBodies.push(rb);
            } catch {

            }
        });
    }

    private unfreezePhysics() {

        // Возвращаем тип тем телам, которые МЫ сами заморозили. wakeUp() тут
        // намеренно НЕ вызывается: за время прицеливания в мире ничего не
        // изменилось, конфигурация стека та же, что была в момент засыпания —
        // значит спящие могут спокойно спать дальше, а физика сама разбудит
        // ровно те тела, которых реально коснётся снаряд или падающий сосед.
        for (const rb of this.frozenBodies) {
            if (!isValid(rb) || !rb.enabled) continue;
            try {
                rb.type = RigidBody.Type.DYNAMIC;
            } catch {

            }
        }
        this.frozenBodies.length = 0;


        // Подчищающий проход на случай, если что-то осталось Kinematic не по
        // нашей вине. Раньше здесь на КАЖДЫЙ выстрел вызывался wakeUp() для
        // всех 400+ тел уровня — это в одиночку убивало весь эффект сна:
        // вся пирамида просыпалась на каждом выстреле и потом заново оседала
        // и засыпала, сжигая солвер. Восстанавливаем только тип, не будим.
        this.forEachGameplayBody((rb) => {
            try {
                if (rb.type !== RigidBody.Type.DYNAMIC) {
                    rb.type = RigidBody.Type.DYNAMIC;
                }
            } catch {

            }
        });
    }
}