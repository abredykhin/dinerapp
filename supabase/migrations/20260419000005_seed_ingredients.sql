-- 005_seed_ingredients.sql
-- Core ingredient vocabulary (~100 items).
-- Staples (salt, oil, sugar, flour, pepper, butter, water) are intentionally
-- excluded — Mom always has them and they add noise to pantry matching.
-- Aliases include common Russian/Ukrainian spelling variants that Gemini might return.

insert into public.ingredients (slug, category, name_en, name_ru, name_uk, aliases) values

-- ── MEAT ──────────────────────────────────────────────────────────────────────
('beef',        'meat',    'Beef',        'Говядина',         'Яловичина',
 array['beef','говядина','яловичина','телятина говяжья','мясо говяжье']),

('pork',        'meat',    'Pork',        'Свинина',          'Свинина',
 array['pork','свинина','свинячина','мясо свиное','свинка']),

('lamb',        'meat',    'Lamb',        'Баранина',         'Баранина',
 array['lamb','баранина','ягнятина','мясо баранье']),

('veal',        'meat',    'Veal',        'Телятина',         'Телятина',
 array['veal','телятина','мясо теленка']),

('rabbit',      'meat',    'Rabbit',      'Кролик',           'Кролик',
 array['rabbit','кролик','крольчатина']),

('liver',       'meat',    'Liver',       'Печень',           'Печінка',
 array['liver','печень','печінка','печінка куряча','печінка свиняча','куриная печень']),

('minced_meat', 'meat',    'Minced meat', 'Фарш',             'Фарш',
 array['minced meat','mince','фарш','мясной фарш','фарш мясной','фарш смешанный']),

('bacon',       'meat',    'Bacon',       'Бекон',            'Бекон',
 array['bacon','бекон']),

('sausage',     'meat',    'Sausage',     'Колбаса',          'Ковбаса',
 array['sausage','колбаса','ковбаса','сосиски','сардельки','колбаска']),

-- ── POULTRY ───────────────────────────────────────────────────────────────────
('chicken',     'poultry', 'Chicken',     'Курица',           'Курка',
 array['chicken','курица','курка','куриное мясо','куряче мясо','куры','курятина','куриная грудка','курячі стегна']),

('turkey',      'poultry', 'Turkey',      'Индейка',          'Індичка',
 array['turkey','индейка','індичка','индюшка','мясо индейки']),

('duck',        'poultry', 'Duck',        'Утка',             'Качка',
 array['duck','утка','качка','утятина']),

('goose',       'poultry', 'Goose',       'Гусь',             'Гусак',
 array['goose','гусь','гусак','гусятина']),

('quail',       'poultry', 'Quail',       'Перепёлка',        'Перепілка',
 array['quail','перепёлка','перепілка','перепела']),

-- ── FISH ──────────────────────────────────────────────────────────────────────
('salmon',      'fish',    'Salmon',      'Лосось',           'Лосось',
 array['salmon','лосось','сёмга','сьомга','форель розовая']),

('trout',       'fish',    'Trout',       'Форель',           'Форель',
 array['trout','форель','радужная форель']),

('cod',         'fish',    'Cod',         'Треска',           'Тріска',
 array['cod','треска','тріска']),

('tuna',        'fish',    'Tuna',        'Тунец',            'Тунець',
 array['tuna','тунец','тунець']),

('tilapia',     'fish',    'Tilapia',     'Тиляпия',          'Тіляпія',
 array['tilapia','тиляпия','тіляпія']),

('herring',     'fish',    'Herring',     'Сельдь',           'Оселедець',
 array['herring','сельдь','оселедець','сельдь маринованная','сельдь соленая']),

('pike',        'fish',    'Pike',        'Щука',             'Щука',
 array['pike','щука']),

('carp',        'fish',    'Carp',        'Карп',             'Короп',
 array['carp','карп','короп']),

('mackerel',    'fish',    'Mackerel',    'Скумбрия',         'Скумбрія',
 array['mackerel','скумбрия','скумбрія']),

('pollock',     'fish',    'Pollock',     'Минтай',           'Мінтай',
 array['pollock','минтай','мінтай']),

('perch',       'fish',    'Perch',       'Окунь',            'Окунь',
 array['perch','окунь','судак']),

('sardine',     'fish',    'Sardine',     'Сардина',          'Сардина',
 array['sardine','сардина','сардинка']),

-- ── SEAFOOD ───────────────────────────────────────────────────────────────────
('shrimp',      'seafood', 'Shrimp',      'Креветки',         'Креветки',
 array['shrimp','prawns','креветки','креветка']),

('squid',       'seafood', 'Squid',       'Кальмар',          'Кальмар',
 array['squid','кальмар','кальмары']),

('mussels',     'seafood', 'Mussels',     'Мидии',            'Мідії',
 array['mussels','мидии','мідії','мідія']),

('crab',        'seafood', 'Crab',        'Краб',             'Краб',
 array['crab','краб','крабовые палочки']),

('scallops',    'seafood', 'Scallops',    'Гребешки',         'Гребінці',
 array['scallops','гребешки','гребінці','морские гребешки']),

-- ── VEGETABLES ────────────────────────────────────────────────────────────────
('potato',      'vegetable','Potato',     'Картофель',        'Картопля',
 array['potato','картофель','картопля','картошка','бульба']),

('carrot',      'vegetable','Carrot',     'Морковь',          'Морква',
 array['carrot','морковь','морква','морковка']),

('onion',       'vegetable','Onion',      'Лук',              'Цибуля',
 array['onion','лук','цибуля','лук репчатый','цибуля ріпчаста']),

('green_onion', 'vegetable','Green onion','Зелёный лук',      'Зелена цибуля',
 array['green onion','spring onion','зелёный лук','зелена цибуля','лук зелёный','перо лука']),

('garlic',      'vegetable','Garlic',     'Чеснок',           'Часник',
 array['garlic','чеснок','часник']),

('cabbage',     'vegetable','Cabbage',    'Капуста',          'Капуста',
 array['cabbage','капуста','белокочанная капуста','капуста білокачанна']),

('red_cabbage', 'vegetable','Red cabbage','Красная капуста',  'Червона капуста',
 array['red cabbage','красная капуста','червона капуста']),

('sauerkraut',  'vegetable','Sauerkraut', 'Квашеная капуста', 'Квашена капуста',
 array['sauerkraut','квашеная капуста','квашена капуста','кислая капуста']),

('tomato',      'vegetable','Tomato',     'Помидор',          'Помідор',
 array['tomato','помидор','помідор','томат','помидоры']),

('cucumber',    'vegetable','Cucumber',   'Огурец',           'Огірок',
 array['cucumber','огурец','огірок','огурцы']),

('bell_pepper', 'vegetable','Bell pepper','Болгарский перец', 'Болгарський перець',
 array['bell pepper','sweet pepper','болгарский перец','болгарський перець','перец сладкий','перець солодкий']),

('eggplant',    'vegetable','Eggplant',   'Баклажан',         'Баклажан',
 array['eggplant','aubergine','баклажан','синенький']),

('zucchini',    'vegetable','Zucchini',   'Кабачок',          'Кабачок',
 array['zucchini','courgette','кабачок','цукіні']),

('broccoli',    'vegetable','Broccoli',   'Брокколи',         'Броколі',
 array['broccoli','брокколи','броколі']),

('cauliflower', 'vegetable','Cauliflower','Цветная капуста',  'Цвітна капуста',
 array['cauliflower','цветная капуста','цвітна капуста']),

('spinach',     'vegetable','Spinach',    'Шпинат',           'Шпинат',
 array['spinach','шпинат']),

('celery',      'vegetable','Celery',     'Сельдерей',        'Селера',
 array['celery','сельдерей','селера']),

('beet',        'vegetable','Beet',       'Свёкла',           'Буряк',
 array['beet','beetroot','свёкла','буряк','бурак','свекла']),

('corn',        'vegetable','Corn',       'Кукуруза',         'Кукурудза',
 array['corn','maize','кукуруза','кукурудза','кукурузные зерна']),

('peas',        'vegetable','Peas',       'Горох',            'Горох',
 array['peas','горох','зелёный горошек','зелений горошок']),

('green_beans', 'vegetable','Green beans','Стручковая фасоль','Стручкова квасоля',
 array['green beans','стручковая фасоль','стручкова квасоля','фасоль стручковая']),

('mushroom',    'vegetable','Mushrooms',  'Грибы',            'Гриби',
 array['mushroom','mushrooms','грибы','гриби','шампиньоны','шампіньйони','вешенки','лесные грибы']),

('leek',        'vegetable','Leek',       'Лук-порей',        'Цибуля-порей',
 array['leek','лук-порей','цибуля-порей','порей']),

('asparagus',   'vegetable','Asparagus',  'Спаржа',           'Спаржа',
 array['asparagus','спаржа']),

('pumpkin',     'vegetable','Pumpkin',    'Тыква',            'Гарбуз',
 array['pumpkin','squash','тыква','гарбуз']),

('sweet_potato','vegetable','Sweet potato','Батат',           'Батат',
 array['sweet potato','батат']),

('radish',      'vegetable','Radish',     'Редиска',          'Редиска',
 array['radish','редиска','редис','редька']),

-- ── GRAINS & STARCHES ─────────────────────────────────────────────────────────
('rice',        'grain',   'Rice',        'Рис',              'Рис',
 array['rice','рис','рис длиннозерный','рис круглый']),

('pasta',       'grain',   'Pasta',       'Макароны',         'Макарони',
 array['pasta','макароны','макарони','спагетти','паста','пенне','фетучини']),

('buckwheat',   'grain',   'Buckwheat',   'Гречка',           'Гречка',
 array['buckwheat','гречка','гречневая крупа','гречана крупа']),

('oats',        'grain',   'Oats',        'Овсяная крупа',    'Вівсяна крупа',
 array['oats','овсянка','вівсянка','геркулес','овсяная крупа','вівсяна крупа']),

('barley',      'grain',   'Barley',      'Перловка',         'Перлова крупа',
 array['barley','перловка','перлова крупа','перловая крупа','ячмень']),

('bulgur',      'grain',   'Bulgur',      'Булгур',           'Булгур',
 array['bulgur','булгур']),

('couscous',    'grain',   'Couscous',    'Кускус',           'Кускус',
 array['couscous','кускус']),

('noodles',     'grain',   'Noodles',     'Лапша',            'Локшина',
 array['noodles','лапша','локшина','яичная лапша','яєчна локшина','рисовая лапша']),

('semolina',    'grain',   'Semolina',    'Манка',            'Манна крупа',
 array['semolina','манка','манная крупа','манна крупа']),

-- ── LEGUMES ───────────────────────────────────────────────────────────────────
('lentils',     'legume',  'Lentils',     'Чечевица',         'Сочевиця',
 array['lentils','чечевица','сочевиця','красная чечевица','зелёная чечевица']),

('chickpeas',   'legume',  'Chickpeas',   'Нут',              'Нут',
 array['chickpeas','нут','нохут','garbanzo']),

('kidney_beans','legume',  'Kidney beans','Красная фасоль',   'Червона квасоля',
 array['kidney beans','красная фасоль','червона квасоля','фасоль красная']),

('white_beans', 'legume',  'White beans', 'Белая фасоль',     'Біла квасоля',
 array['white beans','белая фасоль','біла квасоля','фасоль белая']),

('split_peas',  'legume',  'Split peas',  'Горох колотый',    'Горох колотий',
 array['split peas','горох колотый','горох колотий','желтый горох']),

-- ── DAIRY & EGGS ──────────────────────────────────────────────────────────────
('eggs',        'dairy',   'Eggs',        'Яйца',             'Яйця',
 array['eggs','яйца','яйця','яйцо','куриное яйцо']),

('cheese',      'dairy',   'Cheese',      'Сыр',              'Сир',
 array['cheese','сыр','сир','твердый сыр','твердий сир','плавленый сыр']),

('cottage_cheese','dairy', 'Cottage cheese','Творог',         'Сир (кисломолочний)',
 array['cottage cheese','творог','сир кисломолочний','творог зернистый']),

('sour_cream',  'dairy',   'Sour cream',  'Сметана',          'Сметана',
 array['sour cream','сметана','сметана жирная']),

('cream',       'dairy',   'Cream',       'Сливки',           'Вершки',
 array['cream','сливки','вершки','сливки жирные','жирные сливки']),

('milk',        'dairy',   'Milk',        'Молоко',           'Молоко',
 array['milk','молоко']),

-- ── FRUIT (cooking-relevant) ──────────────────────────────────────────────────
('apple',       'fruit',   'Apple',       'Яблоко',           'Яблуко',
 array['apple','яблоко','яблуко','яблоки']),

('lemon',       'fruit',   'Lemon',       'Лимон',            'Лимон',
 array['lemon','лимон']),

('orange',      'fruit',   'Orange',      'Апельсин',         'Апельсин',
 array['orange','апельсин']),

('plum',        'fruit',   'Plum',        'Слива',            'Слива',
 array['plum','слива']),

('cherry',      'fruit',   'Cherry',      'Вишня',            'Вишня',
 array['cherry','вишня','черешня']),

-- ── OTHER ─────────────────────────────────────────────────────────────────────
('tofu',        'other',   'Tofu',        'Тофу',             'Тофу',
 array['tofu','тофу']),

('walnuts',     'other',   'Walnuts',     'Грецкие орехи',    'Грецькі горіхи',
 array['walnuts','грецкие орехи','грецькі горіхи','орехи грецкие']),

('peanuts',     'other',   'Peanuts',     'Арахис',           'Арахіс',
 array['peanuts','арахис','арахіс','земляной орех']);
