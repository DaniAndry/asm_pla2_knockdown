# 🎮 Система управления уровнями - Полная инструкция

## 📦 Созданные компоненты:

1. **LevelManager.ts** - управление уровнем и отслеживание состояния
2. **ScoreManager.ts** - счетчик очков с плавной анимацией
3. **LevelUIController.ts** - UI победы/поражения для каждого уровня
4. **UniversalCollisionHandler.ts** - обновлен с новым функционалом

---

## 🎯 Система работает так:

### Логика уровня:
1. **LevelManager** собирает все объекты с `UniversalCollisionHandler`
2. Отслеживает сколько снарядов использовано
3. Проверяет условия:
   - ✅ **ПОБЕДА**: все объекты уничтожены за отведенные снаряды
   - ❌ **ПОРАЖЕНИЕ**: снаряды закончились, но остались объекты
4. Отправляет событие `level-completed` с результатом

### Система очков:
1. При уничтожении генерируется рандомное значение 5-10
2. Значение отображается в 3D popup над объектом
3. Очки плавно прибавляются в ScoreManager

### UI система:
1. 3 ноды для 3 уровней
2. Каждая имеет спрайты победы и поражения
3. Автоматически переключаются при завершении уровня

---

## 🛠️ Настройка в редакторе

### Шаг 1: Создание структуры уровня

```
Scene
├── Level1 [LevelManager]
│   ├── Destructibles (все разрушаемые объекты)
│   │   ├── Box1 [UniversalCollisionHandler]
│   │   ├── Box2 [UniversalCollisionHandler]
│   │   └── Box3 [UniversalCollisionHandler]
│   └── ...
├── UIManager [LevelUIController]
│   ├── Level1UI
│   │   ├── VictorySprite [Sprite]
│   │   └── DefeatSprite [Sprite]
│   ├── Level2UI
│   │   ├── VictorySprite [Sprite]
│   │   └── DefeatSprite [Sprite]
│   └── Level3UI
│       ├── VictorySprite [Sprite]
│       └── DefeatSprite [Sprite]
└── ScoreManager [ScoreManager]
    └── ScoreLabel [Label]
```

---

### Шаг 2: Настройка LevelManager

На ноде уровня (например, `Level1`):

1. **Add Component → LevelManager**
2. Настройте параметры:

```
┌─────────────────────────────────────────┐
│ Level Manager                           │
├─────────────────────────────────────────┤
│ Destructibles Parent: [Destructibles]   │
│ Max Projectiles: 10                     │
│ Level Number: 1                         │
└─────────────────────────────────────────┘
```

- **Destructibles Parent** - родительская нода со всеми разрушаемыми объектами
- **Max Projectiles** - сколько снарядов доступно
- **Level Number** - номер уровня (1, 2, 3)

---

### Шаг 3: Настройка UniversalCollisionHandler

На каждом разрушаемом объекте:

```
┌─────────────────────────────────────────┐
│ Universal Collision Handler             │
├─────────────────────────────────────────┤
│ Health: 100                             │
│ ...                                     │
│                                         │
│ 🎵 Audio:                               │
│ Hit Sound: [звук попадания]             │
│ Destruction Sound: [звук уничтожения]   │
│ Audio Source: [AudioSource компонент]   │
│                                         │
│ 🎯 Projectile:                          │
│ Projectile Tag: "Projectile"            │
│                                         │
│ 📊 Score:                               │
│ Main Camera: [Main Camera]              │
│ Score Prefab: [ScorePopup3D префаб]    │
│ Score Parent: [Scene root]              │
│ Score Manager: [ScoreManager нода]      │
└─────────────────────────────────────────┘
```

**Важно**: 
- Снаряды должны содержать слово "Projectile" в названии
- Score Manager - это нода с компонентом ScoreManager

---

### Шаг 4: Настройка ScoreManager

1. Создайте ноду `ScoreManager`
2. Добавьте Label для отображения счета:

```
ScoreManager [ScoreManager]
└── ScoreLabel [Label]
```

3. В инспекторе ScoreManager:

```
┌─────────────────────────────────────────┐
│ Score Manager                           │
├─────────────────────────────────────────┤
│ Score Label: [ScoreLabel]               │
└─────────────────────────────────────────┘
```

Label автоматически обновится: `Score: 0`

---

### Шаг 5: Настройка LevelUIController

1. Создайте ноду `UIManager`
2. Add Component → LevelUIController
3. Создайте UI для каждого уровня:

```
UIManager [LevelUIController]
├── Level1UI
│   ├── VictorySprite [Sprite] - изображение победы
│   └── DefeatSprite [Sprite] - изображение поражения
├── Level2UI
│   ├── VictorySprite [Sprite]
│   └── DefeatSprite [Sprite]
└── Level3UI
    ├── VictorySprite [Sprite]
    └── DefeatSprite [Sprite]
```

4. В инспекторе LevelUIController:

```
┌─────────────────────────────────────────┐
│ Level UI Controller                     │
├─────────────────────────────────────────┤
│ Level 1 UI: [Level1UI]                  │
│ Level 1 Victory: [VictorySprite]        │
│ Level 1 Defeat: [DefeatSprite]          │
│                                         │
│ Level 2 UI: [Level2UI]                  │
│ Level 2 Victory: [VictorySprite]        │
│ Level 2 Defeat: [DefeatSprite]          │
│                                         │
│ Level 3 UI: [Level3UI]                  │
│ Level 3 Victory: [VictorySprite]        │
│ Level 3 Defeat: [DefeatSprite]          │
└─────────────────────────────────────────┘
```

---

## 🔌 Интеграция с системой стрельбы

В вашем скрипте стрельбы (например, `CannonController`):

```typescript
// При выстреле снаряда
fireProjectile() {
    // ... создание снаряда
    
    // Уведомляем LevelManager о выстреле
    const levelManager = this.getCurrentLevelManager(); // Найдите активный LevelManager
    if (levelManager) {
        levelManager.emit('projectile-fired');
    }
}
```

---

## 📊 Система событий

### События от LevelManager:

```typescript
// Уровень начат
this.node.on('level-started', (levelNumber: number) => {
    console.log(`Уровень ${levelNumber} начат!`);
});

// Обновление снарядов
this.node.on('projectiles-updated', (data: { current: number, max: number }) => {
    console.log(`Снарядов: ${data.current}/${data.max}`);
});

// Уровень завершен
this.node.on('level-completed', (data: { 
    levelNumber: number, 
    victory: boolean,
    remainingObjects: number,
    projectilesUsed: number
}) => {
    if (data.victory) {
        console.log('ПОБЕДА!');
        // Переход к следующему уровню
    } else {
        console.log('ПОРАЖЕНИЕ!');
        // Перезапуск уровня
    }
});
```

### События в ScoreManager:

```typescript
// Добавить очки
scoreManager.emit('add-score', 10);
```

---

## 🎮 Запуск уровня

В вашем главном скрипте игры:

```typescript
start() {
    const levelManager = this.level1Node.getComponent(LevelManager);
    if (levelManager) {
        levelManager.startLevel();
    }
}
```

---

## 🔊 Настройка звуков

### Hit Sound (звук попадания):
- Проигрывается при столкновении со снарядом
- Использует `playOneShot()` для наложения звуков
- Работает только если объект называется "Projectile"

### Destruction Sound (звук уничтожения):
- Проигрывается при разрушении объекта
- Использует обычный `play()`

**Пример настройки AudioSource:**
- Volume: 1.0
- Loop: false
- PlayOnAwake: false

---

## 🎲 Рандомные очки

Система автоматически генерирует от **5 до 10 очков** за каждый объект:

```typescript
// В UniversalCollisionHandler
this.scoreValue = Math.floor(Math.random() * 6) + 5; // 5-10
```

Изменить диапазон:
```typescript
// Для 10-20 очков:
this.scoreValue = Math.floor(Math.random() * 11) + 10;

// Для 1-5 очков:
this.scoreValue = Math.floor(Math.random() * 5) + 1;
```

---

## 📱 Пример настройки для 3 уровней

### Level 1:
- Max Projectiles: 10
- Destructibles: 5 объектов
- Difficulty: Easy

### Level 2:
- Max Projectiles: 8
- Destructibles: 8 объектов
- Difficulty: Medium

### Level 3:
- Max Projectiles: 5
- Destructibles: 10 объектов
- Difficulty: Hard

---

## 🐛 Решение проблем

### Звук попадания не работает:
- Проверьте что снаряд содержит "Projectile" в имени
- Проверьте что Hit Sound назначен
- Проверьте что AudioSource есть на объекте

### Очки не прибавляются:
- Проверьте что Score Manager назначен в UniversalCollisionHandler
- Проверьте что ScoreManager компонент на ноде
- Проверьте что Label назначен в ScoreManager

### UI не переключается:
- Проверьте что все спрайты назначены
- Проверьте что события передаются через emit
- Проверьте что Level Number совпадает

### Уровень не завершается:
- Проверьте что событие 'projectile-fired' отправляется
- Проверьте что все объекты имеют UniversalCollisionHandler
- Проверьте что isDestroyed публичный

---

## 🎯 Итоговый чеклист настройки

- [ ] LevelManager добавлен на ноду уровня
- [ ] Destructibles Parent настроен
- [ ] Max Projectiles установлен
- [ ] UniversalCollisionHandler на всех объектах
- [ ] Hit Sound и Destruction Sound назначены
- [ ] Score Manager назначен
- [ ] ScoreManager создан с Label
- [ ] LevelUIController создан
- [ ] Все UI ноды и спрайты настроены
- [ ] Снаряды содержат "Projectile" в имени
- [ ] Система стрельбы отправляет 'projectile-fired'

---

**Готово! Теперь у вас полноценная система управления уровнями! 🎉**
