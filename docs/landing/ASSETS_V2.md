# Визуальные дополнения, 25 октября 2026

Владелец запросил слайдшоу нескольких целей, сохранённого пиксельного светлячка и предметную 3D-инфографику. Применены Impeccable, imagegen и принципы `rt-ib-presentations-3d`: читаемые физические объекты, фаски, толщина, мягкий свет; подписи и последовательность остаются нативным HTML. Палитра пользователя заменяет корпоративную палитру РТ-ИБ. Чужие логотипы и исходная композиция референса не переносились.

## Ассеты

| Файл | Происхождение | Проверка |
| --- | --- | --- |
| `landing/assets/firefly-pixel.png` | ImageGen edit сохранённого `docs/design/ryadom-firefly-pixel-concepts-v1.png`, поза 02 | PNG 1374×1145, настоящий RGBA; угловой alpha=0. Персонаж визуально просмотрен |
| `landing/assets/context-recorder-3d.png` | Built-in ImageGen, материалы/свет из 3D reference локального skill | PNG 1536×1024, настоящий RGBA, угловой alpha=0. Диктофон, кремовые карточки, абрикосовый акцент и шалфейная закладка |

Оригиналы генератора сохранены; в проект скопированы финальные PNG. Внешних загрузок в браузере нет. 3D-иллюстрация lazy-loaded и явно подписана как будущий сценарий. Она не является скриншотом устройства или реализованной функцией записи дня.

## Промпт светлячка

```text
Use case: background-extraction, identity-preserve. Edit the supplied local image: extract ONLY the flying firefly character in the TOP RIGHT, labelled 02 in the source sheet. Preserve its precise identity, amber glowing abdomen, warm brown head and torso, cream translucent pixel wings, two amber antenna tips, large kind amber eyes, the original crisp pixel-art aesthetic and pose. Output this SINGLE character centered, full body, 15% transparent margins all around, no source sheet, no other three poses, no number 02, no labels, no text, no backdrop. Genuinely transparent alpha background. Do not redesign, smooth into vector art, or turn into 3D. Keep the pixel character looking like the same saved mascot. The output is a standalone website sprite, not a new mascot concept.
```

## Промпт 3D

```text
Use case: productivity-visual. Asset type: one isolated 3D object scene for the warm dark Russian product website Ryadom. Explain the idea of a day's voice recording being collected into useful context through concrete objects: a beautifully designed compact graphite voice recorder with an apricot recording button and subtle microphone grille, beside a small neat collection of thick cream paper transcript cards, organized by warm brushed-brass clips and one sage-green bookmark. Make this one coherent compact scene, not a complete infographic or a UI screenshot. Input image is ONLY a materials, bevel thickness, soft studio light and product-render quality reference. Do NOT copy its logo, text, layout, laptop, backup arrows or yellow palette. Style: refined physical 3D product illustration, real readable thickness, soft bevels, brushed warm silver/graphite, warm apricot #e5b68d accents, muted sage, warm cream, compatible with charcoal #24211f background. Three-quarter orthographic perspective, few large meaningful objects, generous transparent margins, full silhouettes. Soft upper-left studio light, gentle realistic reflections, no excessive glass. Background: real transparency, no panel, no dark rectangle, no checkerboard. Text: absolutely none; no letters, numbers, diagrams, UI labels, logos or watermarks. Native HTML labels and connections will be added separately. No person, manul, animal, mascot, anthropomorphic eyes/faces, decorative cubes, or random network balls. The scene should feel quiet and personal, not cybersecurity branding.
```

## Границы содержания

- ML / 300 000 ₽ / повышение — синтетические примеры. Счётчик финансового кейса считает три подтверждённые оплаты по 100 000 ₽, а не автоматически читает банк. В примере повышения засчитан разговор; решение работодателя не обещается.
- Запись дня на устройствах, суммаризация и компоновка контекста описаны как **следующий этап, концепция развития**. Это не реализованное постоянное прослушивание MVP. Пользователь сам включает запись; текущая ручная загрузка остаётся явно указана.
- Указанная владельцем подпись BrainDrive удалена из footer. Исходные лицензии в `app/` не менялись.
- По запросу владельца созданы три настоящих векторных варианта через публичный logo-design skill, источник и проверки в `logo-options/README.md`. Владелец ответил **«Пока никакой»**. Новые знаки не устанавливаются на сайт; варианты остаются отдельными SVG для выбора.
