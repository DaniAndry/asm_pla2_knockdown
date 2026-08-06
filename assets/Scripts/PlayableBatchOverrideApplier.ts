import { _decorator, Component, director, find, js, Node } from 'cc';

const { ccclass, executionOrder } = _decorator;

/** Один таргет из window.__PLAYABLE_ITERATION__ (задаётся super-html batch). */
export type PlayableIterationTarget = {
    nodePath?: string;
    component: string;
    properties: Record<string, unknown>;
};

type PlayableIterationPayload = {
    targets?: PlayableIterationTarget[];
};

/**
 * Единственный «знающий» про playable-batch слой: читает window.__PLAYABLE_ITERATION__
 * и выставляет публичные поля на указанных компонентах. Игровые скрипты (GameSessionController и др.) не трогаем.
 *
 * Повесь на любой узел сцены (например Canvas). executionOrder раньше остальных — чтобы до start() целевых компонентов.
 */
@ccclass('PlayableBatchOverrideApplier')
@executionOrder(-100)
export class PlayableBatchOverrideApplier extends Component {

    start(): void {
        this.applyIterationConfig();
    }

    private applyIterationConfig(): void {
        const g = globalThis as Record<string, unknown>;
        const raw = g.__PLAYABLE_ITERATION__;
        if (!raw || typeof raw !== 'object') {
            return;
        }
        const payload = raw as PlayableIterationPayload;
        const list = payload.targets;
        if (!list || !Array.isArray(list) || list.length === 0) {
            return;
        }
        for (const t of list) {
            if (!t || !t.component || !t.properties) {
                continue;
            }
            this.applyOneTarget(t);
        }
    }

    private applyOneTarget(t: PlayableIterationTarget): void {
        const ctor = js.getClassByName(t.component);
        if (!ctor) {
            console.warn('[PlayableBatchOverrideApplier] js.getClassByName не нашёл:', t.component);
            return;
        }
        const comp = this.resolveComponent(t.nodePath, ctor);
        if (!comp) {
            console.warn(
                '[PlayableBatchOverrideApplier] Компонент не найден:',
                t.component,
                'nodePath:',
                t.nodePath || '(поиск по сцене)'
            );
            return;
        }
        for (const key of Object.keys(t.properties)) {
            const val = t.properties[key];
            if (val === undefined) {
                continue;
            }
            try {
                (comp as unknown as Record<string, unknown>)[key] = val;
            }
            catch (e) {
                console.warn('[PlayableBatchOverrideApplier] Не удалось записать', key, e);
            }
        }
    }

    private resolveComponent(nodePath: string | undefined, ctor: unknown): Component | null {
        const C = ctor as Constructor<Component>;
        if (nodePath && nodePath.trim()) {
            const node = find(nodePath.trim());
            if (!node) {
                return null;
            }
            return node.getComponent(C);
        }
        return this.findFirstComponentOnScene(C);
    }

    private findFirstComponentOnScene(C: Constructor<Component>): Component | null {
        const scene = director.getScene();
        if (!scene) {
            return null;
        }
        const stack: Node[] = [...scene.children];
        while (stack.length > 0) {
            const n = stack.pop()!;
            const c = n.getComponent(C);
            if (c) {
                return c;
            }
            for (let i = 0; i < n.children.length; i++) {
                stack.push(n.children[i]);
            }
        }
        return null;
    }
}

type Constructor<T> = new (...args: unknown[]) => T;
