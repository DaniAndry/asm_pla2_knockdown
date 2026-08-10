import {
    _decorator, Component, Node, Vec3, RigidBody, Collider,
    PhysicsSystem, geometry, isValid, CCFloat,
} from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';

const { ccclass, property } = _decorator;

const _prev = new Vec3();
const _cur = new Vec3();
const _delta = new Vec3();
const _dir = new Vec3();
const _push = new Vec3();
const _vel = new Vec3();
const _ray = new geometry.Ray();

/**
 * Вешается НА ПРЕФАБ СНАРЯДА, рядом с RigidBody.
 *
 * Решает пролёт сквозь объекты «руками»: каждый кадр делает sweep-sphere
 * от прошлой позиции к текущей. Если по пути что-то было — телепортирует
 * снаряд в точку попадания и сам наносит урон.
 *
 * Это работает даже на builtin-физике, где нет нативного CCD,
 * и страхует нативный CCD при просадках FPS.
 */
@ccclass('ProjectileCCD')
export class ProjectileCCD extends Component {
    @property({ type: CCFloat, tooltip: 'Радиус снаряда (примерно = радиус его коллайдера)' })
    radius: number = 0.15;

    @property({ type: CCFloat, tooltip: 'Ниже этой скорости проверка не нужна (м/с)' })
    minSpeed: number = 3;

    @property({ tooltip: 'Гасить снаряд в точку попадания (иначе только урон)' })
    correctPosition: boolean = true;

    @property({ type: CCFloat, tooltip: 'Множитель урона от sweep-попадания' })
    hitMassFallback: number = 1;

    private rb: RigidBody | null = null;
    private selfCollider: Collider | null = null;
    private mask: number = 0xffffffff;
    private hasPrev: boolean = false;
    private useSweep: boolean = true;

    onLoad() {
        this.rb = this.getComponent(RigidBody);
        this.selfCollider = this.getComponent(Collider);
        this.useSweep = typeof (PhysicsSystem.instance as any)?.sweepSphereClosest === 'function';
        this.rebuildMask();
    }

    onEnable() {
        this.node.getWorldPosition(_prev);
        this.hasPrev = true;
        this.rebuildMask();
    }

    onDisable() {
        this.hasPrev = false;
    }

    /** Маска = всё, кроме собственной группы снаряда (иначе sweep ловит сам себя) */
    private rebuildMask() {
        if (isValid(this.selfCollider)) {
            this.mask = 0xffffffff & ~this.selfCollider.getGroup();
        } else {
            this.mask = 0xffffffff;
        }
    }

    lateUpdate() {
        if (!this.hasPrev || !isValid(this.rb) || !this.rb.enabled) return;
        if (this.rb.type !== RigidBody.Type.DYNAMIC) {
            this.node.getWorldPosition(_prev);
            return;
        }

        this.rb.getLinearVelocity(_vel);
        const speed = _vel.length();

        this.node.getWorldPosition(_cur);
        Vec3.subtract(_delta, _cur, _prev);
        const dist = _delta.length();

        // Кадр прошёл меньше собственного радиуса — туннелирование невозможно
        if (speed < this.minSpeed || dist <= this.radius * 0.9) {
            _prev.set(_cur);
            return;
        }

        Vec3.multiplyScalar(_dir, _delta, 1 / dist);
        geometry.Ray.set(_ray, _prev.x, _prev.y, _prev.z, _dir.x, _dir.y, _dir.z);

        const ps = PhysicsSystem.instance;
        let hit = false;

        if (this.useSweep) {
            hit = (ps as any).sweepSphereClosest(_ray, this.radius, this.mask, dist + this.radius, false);
        }
        if (!hit) {
            hit = ps.raycastClosest(_ray, this.mask, dist + this.radius, false);
        }

        if (!hit) {
            _prev.set(_cur);
            return;
        }

        const result = this.useSweep && (ps as any).sweepCastClosestResult?.collider
            ? (ps as any).sweepCastClosestResult
            : ps.raycastClosestResult;

        const otherCollider: Collider = result.collider;
        if (!isValid(otherCollider) || otherCollider.node === this.node) {
            _prev.set(_cur);
            return;
        }

        // 1. Возвращаем снаряд в точку контакта — дальше движок доиграет коллизию сам
        if (this.correctPosition) {
            Vec3.multiplyScalar(_push, result.hitNormal, this.radius * 1.02);
            Vec3.add(_push, result.hitPoint, _push);
            this.node.setWorldPosition(_push);
            this.rb.setLinearVelocity(_vel);
            _prev.set(_push);
        } else {
            _prev.set(_cur);
        }

        // 2. Наносим урон вручную — onCollisionEnter мог не сработать вовсе
        const handler = otherCollider.getComponent(UniversalCollisionHandler);
        if (handler && !handler.isDestroyed) {
            const mass = isValid(this.rb) ? this.rb.mass : this.hitMassFallback;
            handler.applyExternalHit(speed, mass);
        }
    }
}
