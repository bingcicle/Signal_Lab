# Signal Lab: запуск і завантаження на GitHub

Готовий тестовий проєкт із симулятором торгових стратегій. Усі ціни згенеровані; реальних угод застосунок не відкриває.

## Запуск

1. Встанови Node.js версії 22 або новішої, якщо він ще не встановлений.
2. Розпакуй ZIP.
3. Відкрий Terminal у папці `signal-lab` та виконай:

```bash
npm start
```

4. Відкрий http://localhost:4173 у браузері.

`npm install` не потрібен. API-ключі не потрібні. Усі налаштування коду зібрані у `src/config.js`.

## Що можна натискати

- **BTC / ETH / SOL / HYPE**: змінює синтетичний ринок.
- **Trend follow / Mean reversion / Range breakout**: обирає стратегію.
- **Position size**: задає розмір позиції до $20,000.
- **Fee / Slippage**: комісія та прослизання на кожній стороні. 1 bp = 0,01%.
- **Run backtest**: застосовує стратегію й параметри.
- **7D / 14D / 30D**: змінює інтервал.
- **New scenario**: генерує новий набір цін.
- **Replay** та повзунок: показують проходження графіка; підсумкові показники залишаються для повного прогону.
- **Export CSV**: завантажує всі закриті угоди, а не лише видимі рядки.
- **How it works → Download reproducible run**: експортує налаштування, ціни та результат у JSON.

## Завантаження на GitHub

Найнадійніший спосіб: створи на GitHub порожній репозиторій `signal-lab`, без автоматичного README чи ліцензії. Потім у папці проєкту виконай:

```bash
git init -b main
git add .
git commit -m "Initial release: Signal Lab"
git remote add origin https://github.com/YOUR_USERNAME/signal-lab.git
git push -u origin main
```

Заміни `YOUR_USERNAME` своїм логіном. Git використає твій звичайний спосіб входу в GitHub.

Можна й через вебінтерфейс: **Add file → Upload files**, завантаж саме вміст розпакованої папки. README та `index.html` мають бути в корені репозиторію. На Mac натисни **Cmd + Shift + .**, щоб побачити приховані файли та папку `.github`. Додай їх теж, щоб працювали автоматичні перевірки. Сам ZIP завантажувати як код репозиторію не треба.

Опис для поля About:

> Zero-dependency strategy playground with synthetic markets, transparent backtests, and interactive equity curves.

## Як зробити доступне демо

За бажанням: у репозиторії відкрий **Settings → Pages**, обери **Deploy from a branch**, гілку **main** і папку **/ (root)**. GitHub покаже адресу після публікації. У цьому архіві вже є все необхідне для статичного демо.

## Перевірки

```bash
npm run check
npm test
npm run build
```

Результат `build` з'явиться в `dist/`. Цю папку не обов'язково додавати до GitHub: для Pages достатньо файлів у корені.

Математику, обмеження моделі та структуру коду описано в `README.md`.
