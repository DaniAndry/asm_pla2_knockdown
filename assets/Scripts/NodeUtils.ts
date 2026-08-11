import { Component, Node } from 'cc';

/**
 * В Cocos Creator НЕТ встроенного Node.getComponentInParent() (это из Unity).
 * Раньше в проекте (FloorCollisionDestroyer, ProjectileCCD) вызывался именно
 * несуществующий otherNode.getComponentInParent(...) — компоненты просто
 * никогда не были подключены в сцене, поэтому баг не проявлялся, пока их
 * не повесили на реальные ноды.
 *
 * Эта функция — правильная замена: ищет компонент на самой ноде, а если нет —
 * поднимается вверх по цепочке parent, пока не найдёт или не упрётся в корень.
 */
export function findComponentInParents<T extends Component>(
    node: Node | null,
    type: new (...args: any[]) => T,
): T | null {
    let current: Node | null = node;

    while (current) {
        const comp = current.getComponent(type);
        if (comp) return comp;
        current = current.parent;
    }

    return null;
}
