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
    AudioClip,
    AudioSource,
    isValid
} from 'cc';

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
    floorObjectName: string = "Floor";

    @property({ type: Camera, tooltip: 'Камера для Billboard эффекта' })
    mainCamera: Camera = null;

    @property({ type: Prefab, tooltip: '3D префаб с текстом (Label компонент)' })
    scorePrefab: Prefab = null;

    @property({ type: Node, tooltip: 'Родительский узел для спавна 3D текстов' })
    scoreParent: Node | null = null;

    @property({ type: AudioClip, tooltip: 'Звук попадания' })
    hitSound: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: 'Звук уничтожения' })
    destructionSound: AudioClip | null = null;

    @property({ type: AudioSource }) audioSource: AudioSource | null = null;

    @property({ tooltip: 'Тег снаряда (например: Projectile)' })
    projectileTag: string = "Projectile";

    private rb: RigidBody | null = null;
    private lastHitTime: number = 0;
    public isDestroyed: boolean = false;
    private destructionParticles: ParticleSystem | null = null;
    private meshRenderer: MeshRenderer | null = null;
    public scoreValue: number = 0;

    private childMeshes: Node[] = [];

    onLoad() {
        this.rb = this.getComponent(RigidBody);
        const collider = this.getComponent(Collider);

        if (collider) {
            collider.on('onCollisionEnter', this.onCollisionEnter, this);
            collider.on('onCollisionStay', this.onCollisionStay, this);
        }

        this.destructionParticles = this.node.getComponentInChildren(ParticleSystem);
        if (isValid(this.destructionParticles)) {
            this.destructionParticles.node.active = false;
        }

        this.meshRenderer = this.getComponent(MeshRenderer);

        // 💡 собираем все дочерние ноды с MeshRenderer
        this.collectChildMeshes(this.node);
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
            collider.off('onCollisionStay', this.onCollisionStay, this);
        }
    }

    onCollisionStay(event: ICollisionEvent) {
        if (this.isDestroyed) return;
        const otherNode = event.otherCollider.node;
        if (isValid(otherNode) && otherNode.name === this.floorObjectName) {
            this.destroySelf();
            return;
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
        if (isValid(this.hitSound) && isValid(this.audioSource)) {
            this.audioSource.playOneShot(this.hitSound, 1);
        }
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

        if (isValid(this.destructionSound) && isValid(this.audioSource)) {
            this.audioSource.clip = this.destructionSound;
            this.audioSource.play();
        }

        // 🔹 Плавное уменьшение всех мешей перед уничтожением
        for (const meshNode of this.childMeshes) {
            if (!isValid(meshNode)) continue;
            tween(meshNode)
                .to(0.1, { scale: new Vec3(0, 0, 0) })
                .start();
        }

        this.scheduleOnce(() => {
            if (isValid(this.meshRenderer)) this.meshRenderer.enabled = false;

            if (isValid(this.destructionParticles)) {
                this.destructionParticles.node.active = true;
                this.destructionParticles.play();
            }

            this.spawnScorePopup(`+${this.scoreValue}`);
        }, 0.2);

        this.scheduleOnce(() => {
            this.node.destroy();
        }, 0.7);
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
            console.warn("[UniversalCollisionHandler] Нет родительского узла для спавна Score!");
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
        if (isValid(billboardComponent) && isValid(this.mainCamera)) {
            (billboardComponent as any).targetCamera = this.mainCamera;
        }

        tween(scoreNode)
            .by(0.6, { worldPosition: new Vec3(0, 2, 0) }, { easing: 'quadOut' })
            .call(() => {
                if (isValid(scoreNode)) scoreNode.destroy();
            })
            .start();
    }
}
