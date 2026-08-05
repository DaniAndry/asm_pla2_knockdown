# 🚀 Быстрый старт - Система уровней

## 📋 Минимальная настройка за 5 минут

### 1️⃣ Создайте структуру сцены

```
Scene
├── GameController [GameController] ← ГЛАВНЫЙ КОНТРОЛЛЕР
│
├── Level1 [LevelManager]
│   └── Destructibles
│       ├── Box1 [UniversalCollisionHandler]
│       ├── Box2 [UniversalCollisionHandler]
│       └── Box3 [UniversalCollisionHandler]
│
├── Level2 [LevelManager]
│   └── Destructibles
│       └── ...
│
├── Level3 [LevelManager]
│   └── Destructibles
│       └── ...
│
├── UIManager [LevelUIController]
│   ├── Level1UI
│   │   ├── VictorySprite
│   │   └── DefeatSprite
│   ├── Level2UI
│   └── Level3UI
│
└── ScoreManager [ScoreManager]
    └── ScoreLabel [Label]
```

---

### 2️⃣ GameController настройка

```
┌─────────────────────────────────────────┐
│ Game Controller                         │
├─────────────────────────────────────────┤
│ Levels:                                 │
│   [0] Level1                            │
│   [1] Level2                            │
│   [2] Level3                            │
│                                         │
│ Level UI Controller: [UIManager]        │
│ Score Manager: [ScoreManager]           │
└─────────────────────────────────────────┘
```

---

### 3️⃣ LevelManager на каждом уровне

```
Level1:
  Destructibles Parent: Destructibles
  Max Projectiles: 10
  Level Number: 1

Level2:
  Destructibles Parent: Destructibles
  Max Projectiles: 8
  Level Number: 2

Level3:
  Destructibles Parent: Destructibles
  Max Projectiles: 5
  Level Number: 3
```

---

### 4️⃣ UniversalCollisionHandler на объектах

**Обязательно настроить:**
- ✅ Hit Sound (звук попадания)
- ✅ Destruction Sound (звук уничтожения)
- ✅ Audio Source
- ✅ Projectile Tag: "Projectile"
- ✅ Score Manager: [ScoreManager нода]
- ✅ Score Prefab: [3D текст префаб]
- ✅ Main Camera

---

### 5️⃣ Интеграция со стрельбой

В вашем скрипте пушки добавьте:

```typescript
// При выстреле
fireProjectile() {
    // ... создание снаряда
    
    // Уведомить GameController
    const gameController = find('GameController'); // или сохраните ссылку
    if (gameController) {
        const levelManager = gameController.getComponent(GameController)
                            .getCurrentLevelManager();
        if (levelManager) {
            levelManager.node.emit('projectile-fired');
        }
    }
}
```

---

### 6️⃣ Назовите снаряды правильно!

**ВАЖНО**: Снаряды должны содержать "Projectile" в имени:
- ✅ "Projectile"
- ✅ "Cannonball_Projectile"
- ✅ "ProjectileMain"
- ❌ "Cannonball" (не сработает!)

---

## 🎯 Как работает система

1. **GameController** запускает Level1
2. **LevelManager** собирает все объекты с `UniversalCollisionHandler`
3. При выстреле → событие `projectile-fired` → счетчик снарядов -1
4. При попадании → звук попадания
5. При уничтожении объекта:
   - Звук уничтожения
   - Рандомные очки (5-10)
   - 3D popup с очками
   - Очки в ScoreManager
   - Событие в LevelManager
6. **Победа**: все уничтожено → следующий уровень
7. **Поражение**: снаряды кончились → перезапуск

---

## 🎨 UI спрайты

Каждый уровень имеет 2 спрайта:
- **VictorySprite** - показывается при победе
- **DefeatSprite** - показывается при поражении

Они автоматически переключаются!

---

## 🔊 Аудио настройка

**Hit Sound** - короткий звук (удар, стук)
- Используется: `playOneShot()` 
- Можно накладывать несколько

**Destruction Sound** - звук разрушения (взрыв, треск)
- Используется: `play()`
- Один экземпляр

---

## 📊 Счетчик очков

Автоматически:
- Генерируется 5-10 очков за объект
- Показывается в 3D popup
- Плавно прибавляется в ScoreManager
- Формат: "Score: 123"

Изменить диапазон в `UniversalCollisionHandler.ts`:
```typescript
// Строка 147
this.scoreValue = Math.floor(Math.random() * 6) + 5; // 5-10

// Для 10-50:
this.scoreValue = Math.floor(Math.random() * 41) + 10;
```

---

## ✅ Чеклист перед запуском

- [ ] GameController на сцене
- [ ] 3 уровня в массиве levels
- [ ] LevelManager на каждом уровне
- [ ] Max Projectiles установлены
- [ ] UniversalCollisionHandler на всех объектах
- [ ] Звуки назначены
- [ ] Score Manager настроен
- [ ] UI спрайты назначены
- [ ] Снаряды содержат "Projectile"
- [ ] Интеграция с системой стрельбы

---

## 🎮 Готово к запуску!

Запустите игру и стреляйте! Система автоматически:
- ✅ Считает снаряды
- ✅ Определяет победу/поражение
- ✅ Переключает уровни
- ✅ Показывает счет
- ✅ Отображает UI результатов

**Удачи! 🎯**
