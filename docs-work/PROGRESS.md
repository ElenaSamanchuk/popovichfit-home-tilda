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
