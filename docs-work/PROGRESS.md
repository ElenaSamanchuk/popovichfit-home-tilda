# PROGRESS — главная POPOVICHFIT для Тильды

## 29.10.2026 · Claude
- Источник: архив popovichfit-two-pages.zip (home-sales-open / home-sales-closed) → `source/`
- Сборка `node scripts/build-tilda.mjs --base=…@f28c819/assets/` → `tilda/open|closed/1-css, 2-html, 3-js`
- Шапка, меню, подвал вырезаны (с Тильды). Ссылки сверены с popovichfit.ru — все 200; `/new/` = 404, была только в шапке/подвале
- Метки как на живой главной: r и utm_* во внутренние ссылки; r + t.me/POPOVICHcourse_bot → salebot. В новой странице бот другой (popovichfitcourse_bot) — замена на salebot к нему не применяется, вопрос к Елене
- Сверка оригинал ↔ Тильда: 1440/1024/768/390/360/320 оба варианта; исправлены обрезка на 320 (длинные склейки слов) и размер h1 против стилей Тильды
- Репо https://github.com/ElenaSamanchuk/popovichfit-home-tilda (публичный), Pages /docs
- Дальше: Елена вставляет блоки на Тильду → проверить живую страницу на popovichfit.ru (деск + телефон), метки `?r=test&utm_source=test`
- 29.10 решение Елены: ссылку на popovichfitcourse_bot на salebot НЕ подменять; r/utm передаются только во внутренние ссылки
- 29.10 оптимизация загрузки: сертификаты 1,7–1,9 → 0,01 МБ, анимация клуба lazy, preload фона и фото первого экрана (фон догружался); адреса @018f655
- 29.10 решение изменено (Елена): «как на главной сейчас» — при r ссылка на бота (popovichfitcourse_bot и POPOVICHcourse_bot) → salebot 62b5…_1?utm_content=r=…; без r — прямой бот. Первые два блока (hero, «Подход») без lazy
- 29.10 опубликовано Еленой: popovichfit.ru/open и /close — деск ок (метки, якоря, картинки); 401 functions.yandexcloud.net — общий скрипт сайта tilda-tools, не наш
- 29.10 добавлены блоки tilda/menu-footer/0-menu.html и 4-footer.html (шапка fixed + отступ, /new/ → /), выравнивание текста в кнопках/плашках (замер, сдвиг в em), плавное закрытие модалок и вопросов-ответов; ассеты @2415be4
- 29.10 open: кнопки покупки → /predcor и /predpow (на момент правки обе 404 — не опубликованы?); closed без изменений (/course_*)
