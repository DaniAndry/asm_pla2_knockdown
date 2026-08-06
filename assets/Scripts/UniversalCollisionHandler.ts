import {
    _decorator,
    Component,
    RigidBody,
    Collider,
    ICollisionEvent,
    Vec3,
    CCFloat,
    ParticleSystem,
    Node,
    MeshRenderer,
    instantiate,
    Camera,
    Prefab,
    tween,
    Label,
    isValid,
    director
} from 'cc';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('UniversalCollisionHandler')
export class UniversalCollisionHandler extends Component {
    @property({ type: CCFloat }) health: number = 100;
    @property({ type: CCFloat }) damageThreshold: number = 1;
    @property({ type: CCFloat }) destroyThreshold: number = 10;
    @property({ type: CCFloat }) impactDamageFactor: number = 1;
    @property({ type: CCFloat }) minDamageSpeed: number = 0.5;

    @property({ tooltip: 'Использовать систему HP' })
    useHealthSystem: boolean = true;

    @property({ tooltip: 'Название объекта пола для мгновенного уничтожения' })
    floorObjectName: string = 'Floor';

    @property({ type: Prefab, tooltip: '3D префаб с текстом (Label компонент)' })
    scorePrefab: Prefab = null;

    @property({ type: Prefab, tooltip: 'Префаб партиклов уничтожения (спавнится в точке объекта)' })
    destructionParticlePrefab: Prefab | null = null;

    @property({ type: Node, tooltip: 'Родительский узел для спавна 3D Score' })
    scoreParent: Node | null = null;

    @property({ tooltip: 'Имя записи в SoundManager для звука попадания' })
    hitSoundName: string = 'hitWood';

    @property({ tooltip: 'Имя записи в SoundManager для звука уничтожения (пусто = только hit)' })
    destructionSoundName: string = '';

    @property({ tooltip: 'Кулдаун звука попадания (сек), общий на все объекты' })
    hitSoundCooldown: number = 0.12;

    @property({ tooltip: 'Радиус пробуждения соседних RigidBody при уничтожении' })
    wakeRadius: number = 5;

    @property({ tooltip: 'Тег снаряда (например: Projectile)' })
    projectileTag: string = 'Projectile';

    /** Прокидывается из LevelManager */
    private mainCamera: Camera | null = null;

    private rb: RigidBody | null = null;
    private lastHitTime: number = 0;
    public isDestroyed: boolean = false;
    private meshRenderer: MeshRenderer | null = null;
    public scoreValue: number = 0;

    private childMeshes: Node[] = [];

    private static lastGlobalHitSoundTime: number = 0;
    /** Кэш всех живых разрушаемых RB — без полного scan сцены на каждый destroy */
    private static liveBodies: Set<RigidBody> = new Set();
    /** Лимит одновременных FX уничтожения (playable perf) */
    private static activeFxCount: number = 0;
    private static readonly MAX_ACTIVE_FX: number = 6;

    onLoad() {
        this.rb = this.getComponent(RigidBody);
        const collider = this.getComponent(Collider);

        // Только Enter — Stay на 400+ объектах убивает FPS
        if (collider) {
            collider.on('onCollisionEnter', this.onCollisionEnter, this);
        }

        this.meshRenderer = this.getComponent(MeshRenderer);
        this.collectChildMeshes(this.node);

        if (isValid(this.rb)) {
            UniversalCollisionHandler.liveBodies.add(this.rb);
        }
    }

    public applyLevelSharedRefs(camera: Camera | null) {
        this.mainCamera = camera;
    }

    private collectChildMeshes(node: Node) {
        const renderers = node.getComponents(MeshRenderer);
        if (renderers.length > 0) this.childMeshes.push(node);
        for (const child of node.children) {
            this.collectChildMeshes(child);
        }
    }

    onDestroy() {
        const collider = this.getComponent(Collider);
        if (isValid(collider)) {
            collider.off('onCollisionEnter', this.onCollisionEnter, this);
        }
        if (isValid(this.rb)) {
            UniversalCollisionHandler.liveBodies.delete(this.rb);
        }
    }

    onCollisionEnter(event: ICollisionEvent) {
        if (this.isDestroyed || !isValid(this.rb)) return;
        const otherNode = event.otherCollider.node;

        if (isValid(otherNode) && otherNode.name === this.floorObjectName) {
            this.destroySelf();
            return;
        }

        const now = performance.now() / 1000;
        if (now - this.lastHitTime < 0.1) return;
        this.lastHitTime = now;

        if (isValid(otherNode) && otherNode.name.includes(this.projectileTag)) {
            SoundManager.notifyHit();
            this.playHitSound();
        }

        if (!this.useHealthSystem) return;

        const otherRb = event.otherCollider.getComponent(RigidBody);
        if (!isValid(otherRb)) return;

        const velocityA = new Vec3();
        const velocityB = new Vec3();
        this.rb.getLinearVelocity(velocityA);
        otherRb.getLinearVelocity(velocityB);

        const relativeVelocity = new Vec3();
        Vec3.subtract(relativeVelocity, velocityA, velocityB);
        const speed = relativeVelocity.length();

        if (speed < this.minDamageSpeed) return;

        const impactForce = speed * (this.rb.mass + otherRb.mass) * 0.5;
        if (impactForce > this.damageThreshold) {
            const damage = impactForce * this.impactDamageFactor;
            this.applyDamage(damage);
        }
    }

    private playHitSound() {
        if (!this.hitSoundName || !SoundManager.hitsEnabled) return;

        const now = performance.now() / 1000;
        if (now - UniversalCollisionHandler.lastGlobalHitSoundTime < this.hitSoundCooldown) {
            return;
        }
        UniversalCollisionHandler.lastGlobalHitSoundTime = now;
        SoundManager.playOneShot(this.hitSoundName);
    }

    applyDamage(amount: number) {
        this.health -= amount;
        if (this.health <= 0 || amount > this.destroyThreshold) {
            this.destroySelf();
        }
    }

    destroySelf() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        this.scoreValue = Math.floor(Math.random() * 6) + 5;

        this.node.emit('destroyed', this);

        this.playHitSound();
        if (this.destructionSoundName
            && this.destructionSoundName !== this.hitSoundName) {
            SoundManager.playOneShot(this.destructionSoundName);
        }

        const origin = this.node.worldPosition.clone();
        const radius = this.wakeRadius;

        const colliders = this.node.getComponentsInChildren(Collider);
        for (const c of colliders) {
            if (isValid(c)) c.enabled = false;
        }

        if (isValid(this.rb)) {
            UniversalCollisionHandler.liveBodies.delete(this.rb);
            this.rb.setLinearVelocity(Vec3.ZERO);
            this.rb.setAngularVelocity(Vec3.ZERO);
            this.rb.enabled = false;
        }

        UniversalCollisionHandler.wakeAround(origin, radius);

        // Повторный wake через scheduler сцены — this.node.destroy() отменил бы scheduleOnce
        const scene = this.node.scene;
        if (isValid(scene)) {
            const scheduler = director.getScheduler();
            scheduler.schedule(() => {
                UniversalCollisionHandler.wakeAround(origin, radius);
            }, scene, 0, 0, 0.08, false);
        }

        this.hideMeshes();
        this.spawnDestructionParticles(origin);
        this.spawnScorePopup(`+${this.scoreValue}`);

        if (isValid(this.node)) this.node.destroy();
    }

    private hideMeshes() {
        if (isValid(this.meshRenderer)) this.meshRenderer.enabled = false;

        for (const meshNode of this.childMeshes) {
            if (!isValid(meshNode)) continue;
            const renderers = meshNode.getComponents(MeshRenderer);
            for (const renderer of renderers) {
                if (isValid(renderer)) renderer.enabled = false;
            }
        }
    }

    private static wakeAround(origin: Vec3, radius: number) {
        const radiusSqr = radius * radius;

        for (const other of UniversalCollisionHandler.liveBodies) {
            if (!isValid(other) || !other.enabled || !other.isDynamic) continue;

            if (Vec3.squaredDistance(origin, other.node.worldPosition) > radiusSqr) continue;

            other.wakeUp();
            other.applyImpulse(new Vec3(
                (Math.random() - 0.5) * 0.2,
                -Math.max(other.mass * 0.9, 0.6),
                (Math.random() - 0.5) * 0.2
            ));
        }
    }

    private spawnDestructionParticles(worldPos: Vec3) {
        if (!isValid(this.destructionParticlePrefab)) return;
        if (UniversalCollisionHandler.activeFxCount >= UniversalCollisionHandler.MAX_ACTIVE_FX) {
            return;
        }

        const scene = this.node.scene;
        if (!isValid(scene)) return;

        const fxNode = instantiate(this.destructionParticlePrefab);
        if (!isValid(fxNode)) return;

        UniversalCollisionHandler.activeFxCount++;
        scene.addChild(fxNode);
        fxNode.setWorldPosition(worldPos);

        let maxLife = 0.8;
        const systems = fxNode.getComponentsInChildren(ParticleSystem);
        for (const ps of systems) {
            if (!isValid(ps)) continue;
            const lifetime = ps.startLifetime?.constant ?? 0;
            maxLife = Math.max(maxLife, (ps.duration || 0) + lifetime + 0.15);
            ps.play();
        }

        tween(fxNode)
            .delay(maxLife)
            .call(() => {
                UniversalCollisionHandler.activeFxCount = Math.max(0, UniversalCollisionHandler.activeFxCount - 1);
                if (isValid(fxNode)) fxNode.destroy();
            })
            .start();
    }

    spawnScorePopup(text: string) {
        if (!isValid(this.scorePrefab)) return;

        const scoreNode = instantiate(this.scorePrefab);
        if (!isValid(scoreNode)) return;

        let parent: Node | null = null;
        if (isValid(this.scoreParent)) {
            parent = this.scoreParent;
        } else {
            parent = this.node.scene;
        }

        if (!isValid(parent)) {
            scoreNode.destroy();
            return;
        }

        parent.addChild(scoreNode);
        const spawnPos = this.node.worldPosition.clone();
        spawnPos.y += 1;
        scoreNode.setWorldPosition(spawnPos);

        const label = scoreNode.getComponentInChildren(Label);
        if (isValid(label)) {
            label.string = text;
        }

        const billboardComponent = scoreNode.getComponent('BillboardText');
        const camera = isValid(this.mainCamera) ? this.mainCamera : Camera.main;
        if (isValid(billboardComponent) && isValid(camera)) {
            (billboardComponent as any).targetCamera = camera;
        }

        tween(scoreNode)
            .by(0.6, { worldPosition: new Vec3(0, 2, 0) }, { easing: 'quadOut' })
            .call(() => {
                if (isValid(scoreNode)) scoreNode.destroy();
            })
            .start();
    }
}
