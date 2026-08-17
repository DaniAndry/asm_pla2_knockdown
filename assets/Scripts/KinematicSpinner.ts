import {
    _decorator, Component, Node, Vec3, Quat, CCFloat, isValid,
    RigidBody, Collider,
} from 'cc';

const { ccclass, property } = _decorator;

const _q = new Quat();
const _axis = new Vec3();

/**
 * Правильное вращение объекта, у которого есть коллайдер.
 *
 * ПРОБЛЕМА, которую это решает. Если крутить узел с коллайдером, у которого
 * RigidBody типа Static (или RigidBody нет вовсе), движок считает это тело
 * вечно неподвижным: относительная скорость поверхности в контакте равна нулю,
 * а трансформ при этом каждый кадр телепортируется поворотом. Быстрый снаряд в
 * такой контакт упирается и «зависает» перед объектом, пока грань не отвернётся,
 * после чего проваливается внутрь. Ровно это и наблюдается на подиуме.
 *
 * РЕШЕНИЕ. Тело переводится в Kinematic — это официальный режим «двигаю
 * кодом, физика учитывает движение». Решатель берёт скорость поверхности из
 * изменения трансформа, контакт считается корректно, снаряд отскакивает или
 * пробивает, но не залипает.
 *
 * Вешать на сам вращающийся узел с коллайдером (подиум).
 */
@ccclass('KinematicSpinner')
export class KinematicSpinner extends Component {
    @property({ type: Vec3, tooltip: 'Ось вращения в локальных координатах узла. (0,1,0) — вокруг вертикали.' })
    axis: Vec3 = new Vec3(0, 1, 0);

    @property({ type: CCFloat, tooltip: 'Скорость вращения, градусов в секунду. Отрицательное значение — в обратную сторону.' })
    degreesPerSecond: number = 30;

    @property({ tooltip: 'Принудительно перевести RigidBody в Kinematic при старте. Держите включённым: со Static вращающийся коллайдер ловит снаряды намертво.' })
    forceKinematic: boolean = true;

    @property({ tooltip: 'Создать RigidBody, если его нет. Коллайдер без RigidBody движок тоже трактует как неподвижную статику.' })
    addRigidBodyIfMissing: boolean = true;

    @property({ tooltip: 'Предупредить в консоль, если под этим узлом есть ДРУГИЕ физические тела. Вращать родителя физических объектов нельзя — см. комментарий в коде.' })
    warnOnNestedBodies: boolean = true;

    private rb: RigidBody | null = null;
    private angle: number = 0;
    private baseRot: Quat = new Quat();

    onLoad() {
        this.node.getRotation(this.baseRot);

        this.rb = this.getComponent(RigidBody);
        if (!isValid(this.rb) && this.addRigidBodyIfMissing && this.getComponent(Collider)) {
            this.rb = this.addComponent(RigidBody);
        }

        if (isValid(this.rb) && this.forceKinematic) {
            this.rb.type = RigidBody.Type.KINEMATIC;
            this.rb.useGravity = false;
        }

        if (this.warnOnNestedBodies) this.checkNestedBodies();
    }

    update(dt: number) {
        if (dt <= 0) return;

        this.angle += this.degreesPerSecond * dt;
        if (this.angle >= 360 || this.angle <= -360) this.angle %= 360;

        _axis.set(this.axis);
        if (_axis.lengthSqr() < 1e-6) return;
        _axis.normalize();

        Quat.fromAxisAngle(_q, _axis, this.angle * Math.PI / 180);
        Quat.multiply(_q, this.baseRot, _q);
        this.node.setRotation(_q);
    }

    /**
     * Вращение РОДИТЕЛЯ физических тел — отдельная беда, которую сменой типа
     * не лечится. Каждый кадр движку приходится переписывать трансформ всех
     * вложенных тел (syncSceneToPhysics), кэш контактов рушится, стек дрожит, а
     * быстрые снаряды ведут себя непредсказуемо. Физике нельзя двигать тела
     * «снаружи», через родителя — она сама должна ими управлять.
     */
    private checkNestedBodies() {
        const bodies = this.node.getComponentsInChildren(RigidBody);
        let nested = 0;
        for (const b of bodies) {
            if (isValid(b) && b.node !== this.node) nested++;
        }
        if (nested > 0) {
            console.warn(
                `[KinematicSpinner] Под узлом "${this.node.name}" находится ${nested} других физических тел. ` +
                `Вращение родителя физических объектов ломает физику: их трансформы каждый кадр переписываются ` +
                `снаружи, контакты пересоздаются, снаряды залипают и проваливаются. ` +
                `Вращайте камеру вокруг уровня либо вынесите вращение на отдельный визуальный узел без коллайдеров.`
            );
        }
    }
}
