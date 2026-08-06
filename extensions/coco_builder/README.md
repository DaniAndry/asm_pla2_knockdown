# super-html (Cocos Creator extension)

Расширение для сборки playable/super-html билдов.

## Установка (через HTTPS, без SSH-ключей)

1. Убедитесь, что на ПК установлен Git.
   - В `PowerShell` или `cmd` выполните:

```powershell
git --version
```

   - Если команда сработала и показала версию (например `git version 2.49.0`) — переходите к шагу 2.
   - Если команда не найдена — установите Git с [git-scm.com](https://git-scm.com/downloads), затем перезапустите терминал и снова проверьте `git --version`.

2. Откройте `PowerShell` **или** `cmd`.
3. Перейдите в папку `extensions` вашего проекта Cocos.
4. Выполните:

```powershell
cd "D:\Projects\MyCocosGame\extensions"
git clone https://github.com/soluslike/coco_builder.git super-html
```

5. Перезапустите Cocos Creator (или переоткройте проект).

## Как обновлять расширение

### Вариант 1 (рекомендуется)
В панели расширения нажмите кнопку `Обновить расширение`.

### Вариант 2 (вручную через git)

```powershell
cd "D:\Projects\MyCocosGame\extensions\super-html"
git pull
```

## Важно

- При установке через `git clone` кнопка обновления скачивает апдейт автоматически.
- При установке из ZIP кнопка обновления проверяет наличие новой версии и показывает ссылку для ручного скачивания.
- При HTTPS GitHub может попросить авторизацию (через Git Credential Manager / token).

## Полезные ссылки

- Репозиторий: [https://github.com/soluslike/coco_builder](https://github.com/soluslike/coco_builder)
- Cocos Store (оригинал): [https://store.cocos.com/app/detail/3657](https://store.cocos.com/app/detail/3657)
