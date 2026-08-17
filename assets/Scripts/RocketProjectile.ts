import {
    _decorator, Component, Node, Vec3, Prefab, instantiate, isValid,
    RigidBody, Collider, ICollisionEvent, CCFloat, ParticleSystem, tween,
    director, Director, MeshRenderer,
} from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';
import { SoundManager } from './SoundManager';
import { findComponentInParents } from './NodeUtils';

const { ccclass, property } = _decorator;

const _self = new Vec3();
const _other = new Vec3();
const _impulse = new Vec3();
const _vel = new Vec3();

interface PendingKnock {
    rb: RigidBody;
    x: number;
    y: number;
    z: number;
}

@ccclass('RocketProjectile')
export class RocketProjectile extends Component {
    @property({ type: CCFloat, tooltip: 'Радиус толчка в мировых единицах' })
    explosionRadius: number = 3.5;

    @property({ type: CCFloat, tooltip: 'Желаемая скорость в центре взрыва (м/с). К краю радиуса спадает.' })
    explosionImpulse: number = 14;

    @property({ type: CCFloat, tooltip: 'Подброс вверх: 0 = чисто радиально, 0.5 = заметно подкидывает.' })
    upwardBias: number = 0.45;

    @property({ tooltip: 'Ломать разрушаемые объекты в радиусе (только те, у кого включён Use Health System).' })
    breakDestructibles: boolean = false;

    @property({ type: CCFloat, tooltip: 'Радиус разрушения. 0 = использовать радиус толчка.' })
    breakRadius: number = 2.2;

    @property({ type: Prefab, tooltip: 'Префаб эффекта взрыва (партиклы). Необязателен.' })
    explosionFxPrefab: Prefab = null;

    @property({ type: CCFloat, tooltip: 'Через сколько секунд убрать эффект взрыва' })
    fxLifetime: number = 1.5;

    @property({ tooltip: 'Имя звука взрыва в SoundManager' })
    explosionSoundName: string = 'rocketExplosion';

    @property({ type: CCFloat, tooltip: 'Сколько секунд ещё держать физику ракеты после удара, чтобы солвер успел толкнуть стек' })
    bodyPersistTime: number = 0.12;

    @property({ type: CCFloat, tooltip: 'Автоподрыв, если ракета ни во что не попала (сек). 0 = не подрывать.' })
    fuseTime: number = 6;

    @property({ tooltip: 'Тег/подстрока в имени, по которой узел считается снарядом и НЕ вызывает подрыв' })
    ignoreTag: string = 'Projectile';

    private exploded: boolean = false;
    private knocksFlushed: boolean = false;
    private collider: Collider | null = null;
    private pendingKnocks: PendingKnock[] = [];

    onEnable() {
        this.exploded = false;
        this.knocksFlushed = false;
        this.pendingKnocks.length = 0;
        this.collider = this.getComponent(Collider);
        if (isValid(this.collider)) {
            this.collider.on('onCollisionEnter', this.onHit, this);
        }
        if (this.fuseTime > 0) this.scheduleOnce(this.explodeFromFuse, this.fuseTime);
    }

    onDisable() {
        director.off(Director.EVENT_AFTER_PHYSICS, this.flushKnocks, this);
        if (isValid(this.collider)) {
            this.collider.off('onCollisionEnter', this.onHit, this);
        }
        this.unschedule(this.explodeFromFuse);
        this.unschedule(this.finishRocket);
    }

    private explodeFromFuse = () => {
        this.explode();
    };

    private onHit(event: ICollisionEvent) {
        if (this.exploded) return;

        const other = event.otherCollider?.node;
        if (isValid(other) && this.ignoreTag && other.name.indexOf(this.ignoreTag) >= 0) return;

        const hitRb = event.otherCollider?.attachedRigidBody
            || findComponentInParents(other, RigidBody);
        this.explode(hitRb);
    }

    public explode(directHit: RigidBody | null = null) {
        if (this.exploded) return;
        this.exploded = true;
        this.unschedule(this.explodeFromFuse);

        this.node.getWorldPosition(_self);
        this.queueKnocks(_self, directHit);
        if (this.breakDestructibles) this.damageDestructibles(_self);

        this.spawnFx(_self);
        if (this.explosionSoundName) SoundManager.playOneShot(this.explosionSoundName);
        this.hideMeshes(this.node);

        director.once(Director.EVENT_AFTER_PHYSICS, this.flushKnocks, this);
        this.scheduleOnce(this.flushKnocks, 0);
        this.scheduleOnce(this.finishRocket, Math.max(0.05, this.bodyPersistTime));
    }

    private queueKnocks(center: Vec3, directHit: RigidBody | null) {
        const r = Math.max(0.01, this.explosionRadius);

        if (isValid(directHit)) this.queueOne(directHit, center, r, true);

        UniversalCollisionHandler.forEachLiveBody((rb) => {
            this.queueOne(rb, center, r, false);
        });
    }

    private queueOne(rb: RigidBody, center: Vec3, radius: number, force: boolean) {
        if (!isValid(rb) || !rb.enabled) return;
        if (rb.node === this.node) return;
        if (!rb.node?.activeInHierarchy) return;

        try {
            if (rb.type === RigidBody.Type.STATIC) return;

            rb.node.getWorldPosition(_other);
            Vec3.subtract(_impulse, _other, center);
            const d2 = _impulse.lengthSqr();
            if (!force && d2 > radius * radius) return;

            const d = Math.sqrt(Math.max(d2, 0));
            if (d < 1e-3) _impulse.set(Math.random() - 0.5, 1, Math.random() - 0.5);
            _impulse.normalize();

            if (this.upwardBias > 0) {
                _impulse.y = Math.max(_impulse.y, 0) + this.upwardBias;
                _impulse.normalize();
            }

            const falloff = force ? 1 : Math.max(0, 1 - d / radius);
            // explosionImpulse читаем как целевую скорость в м/с, не как kg·m/s:
            // applyImpulse на этом бэкенде мёртв, а огромный impulse/mass
            // телепортирует тело и его убивает MAX_STEP_DISTANCE.
            const speed = Math.min(14, Math.max(4, this.explosionImpulse)) * falloff;
            _impulse.multiplyScalar(speed);

            if (rb.type !== RigidBody.Type.DYNAMIC) rb.type = RigidBody.Type.DYNAMIC;
            try { rb.wakeUp(); } catch { }

            this.pendingKnocks.push({ rb, x: _impulse.x, y: _impulse.y, z: _impulse.z });
        } catch { }
    }

    private flushKnocks = () => {
        if (this.knocksFlushed) return;
        this.knocksFlushed = true;
        director.off(Director.EVENT_AFTER_PHYSICS, this.flushKnocks, this);

        for (let i = 0; i < this.pendingKnocks.length; i++) {
            const k = this.pendingKnocks[i];
            if (!isValid(k.rb) || !k.rb.enabled) continue;
            try {
                if (k.rb.type === RigidBody.Type.STATIC) continue;
                if (k.rb.type !== RigidBody.Type.DYNAMIC) k.rb.type = RigidBody.Type.DYNAMIC;
                k.rb.wakeUp();
                k.rb.getLinearVelocity(_vel);
                _vel.x += k.x;
                _vel.y += k.y;
                _vel.z += k.z;
                k.rb.setLinearVelocity(_vel);
            } catch { }
        }
        this.pendingKnocks.length = 0;
    };

    private finishRocket = () => {
        this.flushKnocks();
        const rb = this.getComponent(RigidBody);
        if (isValid(rb)) {
            try {
                rb.setLinearVelocity(Vec3.ZERO);
                rb.setAngularVelocity(Vec3.ZERO);
            } catch { }
            rb.enabled = false;
        }
        if (isValid(this.collider)) this.collider.enabled = false;
        if (isValid(this.node)) this.node.destroy();
    };

    private hideMeshes(node: Node) {
        const meshes = node.getComponentsInChildren(MeshRenderer);
        for (let i = 0; i < meshes.length; i++) {
            if (isValid(meshes[i])) meshes[i].enabled = false;
        }
    }

    private damageDestructibles(center: Vec3) {
        const r = this.breakRadius > 0 ? this.breakRadius : this.explosionRadius;
        const r2 = r * r;
        const scene = director.getScene();
        if (!scene) return;

        let handlers: UniversalCollisionHandler[];
        try {
            handlers = scene.getComponentsInChildren(UniversalCollisionHandler);
        } catch {
            return;
        }

        for (const h of handlers) {
            if (!isValid(h) || h.isDestroyed) continue;
            if (!isValid(h.node) || !h.node.activeInHierarchy) continue;
            h.node.getWorldPosition(_other);
            if (Vec3.squaredDistance(_other, center) > r2) continue;
            _impulse.set(_other.x - center.x, _other.y - center.y, _other.z - center.z);
            _impulse.normalize();
            try { h.applyExternalHit(this.explosionImpulse, 1, _impulse); } catch { }
        }
    }

    private spawnFx(pos: Vec3) {
        if (!this.explosionFxPrefab) return;
        const scene = director.getScene();
        if (!scene) return;

        const fx = instantiate(this.explosionFxPrefab);
        fx.setParent(scene);
        fx.setWorldPosition(pos);

        for (const ps of fx.getComponentsInChildren(ParticleSystem)) {
            if (isValid(ps)) ps.play();
        }

        const life = Math.max(0.1, this.fxLifetime);
        tween(fx).delay(life).call(() => { if (isValid(fx)) fx.destroy(); }).start();
    }
}
