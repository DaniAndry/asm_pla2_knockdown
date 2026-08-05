// === TrajectoryDrawer3D.ts ===
import { _decorator, Component, Node, Vec3, Prefab, instantiate, CCFloat } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TrajectoryDrawer3D')
export class TrajectoryDrawer3D extends Component {
    @property(Prefab) pointPrefab: Prefab = null;
    @property(CCFloat) maxTime: number = 2.0;
    @property(CCFloat) timeStep: number = 0.1;
    @property(CCFloat) gravity: number = 9.8;

    private _points: Node[] = [];
    private _pointsPool: Node[] = []; // Пул точек для переиспользования

    draw(startPos: Vec3, velocity: Vec3) {
        // Скрываем текущие точки
        this.hidePoints();

        const g = this.gravity;
        const dt = this.timeStep;
        let pointIndex = 0;

        for (let t = 0; t <= this.maxTime; t += dt) {
            const x = startPos.x + velocity.x * t;
            const y = startPos.y + velocity.y * t - 0.5 * g * t * t;
            const z = startPos.z + velocity.z * t;

            const pos = new Vec3(x, y, z);
            
            // Получаем точку из пула или создаем новую
            let point = this.getPointFromPool();
            point.setWorldPosition(pos);
            point.active = true;
            this._points.push(point);
            pointIndex++;
        }
    }

    // Скрываем точки (возвращаем в пул)
    private hidePoints() {
        for (const point of this._points) {
            if (point && point.isValid) {
                point.active = false;
                this._pointsPool.push(point);
            }
        }
        this._points.length = 0;
    }
    
    // Получаем точку из пула или создаем новую
    private getPointFromPool(): Node {
        if (this._pointsPool.length > 0) {
            return this._pointsPool.pop();
        }
        
        // Создаем новую точку только если пул пуст
        const point = instantiate(this.pointPrefab);
        this.node.scene.addChild(point);
        return point;
    }

    clear() {
        // Полное очищение (используется при уничтожении компонента)
        this.hidePoints();
        
        // Уничтожаем все точки в пуле
        for (const point of this._pointsPool) {
            if (point && point.isValid) {
                point.destroy();
            }
        }
        this._pointsPool.length = 0;
    }
    
    onDestroy() {
        this.clear();
    }
}

