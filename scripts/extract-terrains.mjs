// Джерела:
//  - Планшет-мінометника.html (прототип): id/name/size/sizeZ/tiles/mod/places для кожного терену.
//  - GeNeFRAG/ArmaReforger, maps_core/all_arma_maps.json (MIT): resources.map_image (те саме,
//    що й "sat" у прототипі — звірено побайтово) і resources.height_data (лише 10 із 23 теренів).
//    https://github.com/GeNeFRAG/ArmaReforger/blob/main/maps_core/all_arma_maps.json
//  - EnfusionMapMaker, Web/everon/everon-locations.js і Web/arland/arland-locations.js (APL-SA):
//    назви й координати пунктів Everon/Arland — перенесено з прототипу (уже містив ці дані).
//
// Прототипів id "kolguyev" немає в репозиторії GeNeFRAG (там namespace "kolguev", без "y") —
// зіставлення нижче враховує цю розбіжність написання.
//
// УВАГА: reforger.recoil.org з часу написання прототипу змінив структуру сайту (SvelteKit).
// Стара схема "{terrain}/LODS/{lod}/{x}/{y}/tile.jpg" тепер віддає 404 (SPA-фолбек).
// Перевірено вручну через мережеві запити реальної сторінки: чинна схема —
// "map-tiles/{terrain}/{lod}/{x}/{y}/tile.jpg", і Arland тепер теж має maxLod=5 (не 4,
// як було зафіксовано в прототипі й у завданні) — на сайті знайдено тайли lod 1..5 для Arland,
// lod 0..5 для Everon. Розмір тайла в пікселях також змінився (не 256, а ~542px), але це не
// впливає на математику SPAN0 (вона про метри світу на тайл, а не про роздільність файлу).
import { writeFileSync } from "node:fs";

const ALL_MAPS_URL =
  "https://raw.githubusercontent.com/GeNeFRAG/ArmaReforger/main/maps_core/all_arma_maps.json";

// Терени з каталогу GeNeFRAG (є супутниковий знімок і, для деяких, дані висот).
// 1:1 перенесено з масиву PRESETS у прототипі, звужено до вибраних користувачем мап.
const BASE = [
  {
    id: "everon", name: "Everon", sizeX: 12800, sizeZ: 12800, official: true,
    tiles: { base: "https://reforger.recoil.org/map-tiles/everon/", maxLod: 5 },
    places: [["Airport",4893,11801],["St Phillipe",4501,10776],["Power Plant",5827,9787],["St Pierre",9689,1558],["Meaux",4518,9468],["Tyrone",4949,9076],["Andres Beacon",6844,8191],["Gravette",4128,7792],["Villeneuve",2847,6340],["Morton",5137,4010],["Lamentin",1281,5947],["Chotain",7088,6012],["Montignac",4776,7087],["Provins",5488,6083],["Figari",5256,5341],["Camurac",6594,3117],["Quarry",8787,3913],["Regina",7188,2312],["Durras",8826,2746],["Farm",5010,9964],["Gorey",4845,8089],["Sawmill",3114,5222],["Chotain Industrial",6456,6487],["Hillside",6918,4450],["Coastal Base Chotain",7444,6698],["Military Base Levie",7477,4302],["Military Hospital",3905,8450],["Coastal Base Lamentin",1063,6048],["Coastal Base Morton",4957,3876],
      // Контрольні точки з reforger.recoil.org/everon (назви без префіксів TownBase/SmallBase/...). Це
      // центри зон захоплення, тож позиція наближена до населеного пункту, а не точний центр селища.
      ["Vernon",9128,2292],["Black Lake",9453,2946],["Laruns",7403,5281],["Pennants Pass",8238,2164],["Kermovan",6437,9667],["Simons Wood",6579,5136],["Maidens Bay",5229,10702],["Entre-Deux",6015,7178],["Hornbeam Valley",5377,8334],["Tillers Find",3790,6998],["Richemont",4539,4994],["Shepherds",3295,4471],["Le Moule",2439,5438],["Main Base North",4406,11035],["Main Base South",10173,1540]]
  },
  {
    id: "arland", name: "Arland", sizeX: 4095, sizeZ: 4095, official: true,
    tiles: { base: "https://reforger.recoil.org/map-tiles/arland/", maxLod: 5 },
    places: [["Beauregard",3169,2796],["Farm",2209,2909],["Airport Base",947,2896],["Military Training Base",1413,1858],["Arleville",2777,1624],["Moss Hill",2293,1224],["Signal Hill",2507,2267]]
  },
  {
    id: "kolguyev", name: "Kolguyev", sizeX: 12800, sizeZ: 12800, official: true,
    // reforger.recoil.org тримає Kolguyev під внутрішнім кодовим ім'ям "cain" (перевірено
    // мережевими запитами реальної сторінки /kolguyev — не "kolguyev"/"kolguev"). Онлайн-тайли
    // тут візуально чистіші за 2.4 ГБ PNG з GeNeFRAG (той має видимий шов різної експозиції
    // між знімками — перевірено складанням тайлів піраміди напряму з диска).
    tiles: { base: "https://reforger.recoil.org/map-tiles/cain/", maxLod: 5 },
    // Пункти — контрольні точки з карти reforger.recoil.org/kolguyev (ті самі, що там показано на
    // шарі "Control points"; у коді сайту вони названі CP_*). Перевірено накладанням на тайли:
    // усі сім лягають на відповідні селища/об'єкти з точністю до десятків метрів.
    places: [["Kamensk",11867,10680],["Mineraly",6322,8012],["Ugoldar",6642,3907],["Crossroad",8559,9376],["Gorshkovo",8422,6592],["Mine",3674,5223],["Villa",1951,7401]]
  },
  {
    id: "badorb", name: "Bad Orb", sizeX: 5120, sizeZ: 5120, official: false,
    // Назви й координати — з самого мода (Bad Orb 5.0, Worlds/.../Labels/Place_Labels.layer,
    // сутності з SCR_MapDescriptorComponent; тип Town/Settlement/Village/Local). Розмір 5120 м
    // підтверджено заголовком Terrain (5121 вершина, крок 1 м).
    places: [["Westen Bad Orb",4789,3572],["Wasserversorgung Bad Orb",3407,4456],["Hof Lomelsberg",1786,4066],["Ruckberg",2306,3986],["Allenburg",3247,3332],["Kasselberg",3491,2839],["Huhnerberg",3711,1985],["Sonnenberg",3740,1713],["Bocksberg",4454,1721],["Schubert Ranch",4373,2566],["Ersteberg",2020,2843],["Funf-Wege",4325,4360],["Forstfahrzeug-Wartungshof",4415,4816],["Bad Orb Spielfeld",3851,4140],["Krestberg",3594,4973],["Wasserberg",3486,3579],["Mittbach",450,5091],["Kassel",213,889],["FM 93.3",1342,3631]]
  },
  {
    id: "gogland", name: "Gogland", sizeX: 12288, sizeZ: 12288, official: false,
    // Каталог GeNeFRAG дає 12286, але заголовок Terrain мода (Gogland.terr) — 6145 вершин з кроком 2 м,
    // тобто 12288 м (і 12288/32768 = 0.375 м/піксель знімка рівно). Беремо 12288.
    sizeFromMod: true,
    // Знімок gogland_sat_z7_full.png покриває не 12288 м, а ≈12279 м від (0,0): контури будівель з .topo розходяться з дахами на знімку лінійно, до 9 м біля північно-східного краю
    // (виміряно по 21 селу scripts/refine-buildings.mjs --offset: dx ≈ 0.0008·x, dz ≈ 0.00075·z). Тому зображення накладається на imageSpan, а не на sizeX.
    imageSpan: 12279,
    // Назви — з файлів мода (Gogland_Layers/Names.layer: сутності SCR_MapDescriptorComponent).
    places: [["Kiiskinkylä",7221,5314],["Suurkylä",5463,9137],["Lounatrivi",7411,1093],["Vähäkorkia",7136,2124],["Mattila",6693,2110],["Valkiakallio",6695,1650],["Heikinhelli",5852,1435],["Vähäkorkianniemi",5842,1999],["Pahanraonkallio",5938,2978],["Maahelli",5604,3587],["Lounatkylä",6786,2885],["Lounatkorkia",6665,2797],["Maahellinkallio",5967,3998],["Suurlinna",5890,4256],["Mustalovi",5222,4462],["Lettolahti",5254,4822],["Selkäapajanniemi",4957,4961],["Alttarkallio",8012,2616],["Välikallio",7435,3886],["Kippariniemi",8266,3765],["Purjeniemi",7708,4706],["Somerikonkalliot",5440,5690],["Variskallio",6361,5723],["Liivalahti",6528,6635],["Haukkavuori",5601,6839],["Lammaskallio",6079,7111],["Mäkiinpäällys",5134,8019],["Purjekallio",4473,8502],["Kotokallio",5119,8367],["Majakallio",4636,9104],["Hirskallio",5679,9707],["Pohjoiskorkia",4427,9946],["Vähasomerikonlahti",4202,9024],["Mustakallio",4137,10290],["Pohjoisrivi",4623,11104],["Lipeäkallio",5976,7738],["Lounatjärvi",6762,3248],["Ruokolahdenjärvi",6358,4657],["Pahalampi",7367,3570],["Länsikallio",6588,5168],["Vetelijärvi",5994,5303],["Liiralahdenjärvi",5839,6067],["Mustajyrkkä",7134,5722],["Notkonhelli",4692,6416],["Kappeliniemi",5722,8554],["Pohjoissivunkallio",5049,10146],["Rivinkallio",4609,10612],["Isosommeri",2502,2103],["Ruuskeri",10130,6479],["Säkkiluoto",9453,10758],["säyvö",1128,5126],["Miettilä",6929,4092],["Jokela",5012,6420],["Niemenkylä",6289,7452],["Teollisuusalue",7486,3183],["Korkiala",4155,9836],["Armeijan varikko",4523,8824]]
  }
];

// Мод-карти поза каталогом GeNeFRAG — немає ні супутникового знімка, ні даних висот, ні
// підтвердженого точного розміру. Перевірено вручну (браузер, вересень 2026): жодна з цих
// чотирьох воркшоп-сторінок не публікує top-down супутниковий знімок терену — лише один
// рекламний 3D-скріншот під кутом, непридатний для прив'язки координатної сітки. Розміри
// нижче — НАЙКРАЩА ОЦІНКА, позначена як така; користувач має звірити й поправити в вкладці
// «Карта» (поле розміру чи прив'язка по двох точках), перш ніж довіряти сітці координат.
// Карту зображення треба буде завантажити вручну («Завантажити карту», власний скріншот
// зверху з редактора чи гри) — автоімпорту з мережі для цих теренів нема.
const MANUAL = [
  // Усі п'ять — моди Workshop; розмір, назви пунктів і висоти прочитано з файлів самих модів
  // (Terrain.HEAD: вершин x крок; SCR_MapDescriptorComponent у шарах .layer; .ttile -> висоти).
  // Супутникового знімка в них немає — карту зображенням завантажує користувач («Карта» → «Завантажити карту…»).
  {
    id: "bystrany", name: "Bystrany", sizeX: 12288, sizeZ: 12288, official: false,
    // 8193 вершини x 1.5 м = 12288 м (раніше було припущено 5000 за "~25 км²" з опису).
    places: [["Kamoryn",3368,8265],["Old Checkpoint",3012,8664],["Old Checkpoint",2727,8538],["Mostni Forest",5035,7639],["Bysovice Airfield",3593,9609],["Bysovice Military Base",3901,9354],["Klesnov",640,11118],["Skalovice",573,8714],["Mezna",6578,9358],["Stara Olesov",8160,7158],["Kamna Srbice",9464,9564],["Janovice",10468,7494],["Luzohrad",6209,6371],["Hnevice",5887,5876],["Javory",5091,9754],["Mirkov",3106,7039],["Drahov",732,4506],["Rajewka",5162,11739],["Luziny",9441,7909],["Hrad Pasastejn",4842,6380],["Dolina",6278,8716],["Vysoka",6441,4532],["Arntsevo",3092,11176],["Nova Olesov",7105,7913],["Pasastejn",5026,6289],["Featherfall Pond",7054,8156],["Rockslide Pond",7381,8179],["Stonewatch Cave",799,9182],["Threebrook Hollow",5897,7243],["Summerstone Cave",5886,8625],["Hunter's Rest",4008,8639],["Rootgrave Hollow",5032,8833],["Rabbit's Locker",3305,10066],["Kamoryn Military Base",4069,7575],["Power Plant",6520,6502],["Industrial",3319,9202],["Hnevice Military Base",6545,5817],["Industrial",6877,5951],["Dobrinka",5128,3791],["Lovetin",2311,6067]]
  },
  {
    id: "ironholdcastle", name: "Iron Hold Castle", sizeX: 1024, sizeZ: 1024, official: false,
    // 513 вершин x 2 м = 1024 м — це крихітний острів, а не 10 км.
    places: [["Keep Ruin",426,532]]
  },
  {
    id: "kirovograd", name: "Kirovograd", sizeX: 8192, sizeZ: 8192, official: false,
    // 4097 вершин x 2 м = 8192 м. Назви — шари Dubkovicy_Layers (світ мода); Cherno_Layers належать
    // іншому світу й сюди не беруться.
    places: [["Lesniki",802,2185],["Bugor Military",1147,3870],["Druzhba",1988,4553],["Kamensk Mine",2093,5248],["Polyanka",1170,907],["Oil refinery",3151,7163],["Zvezda factory",3721,3455],["Pig farms",1045,4302],["Mezciems",966,7548],["Mucenieki ",4579,4139],["City Administration",4059,3736],["City Administration",2184,2219],["Kirovo military base",1678,3814],["Pogorevka",1020,5735],["Marianka military base",5810,2903],["Marianka",3534,4830],["Lesniki",439,1198],["Alexandrovka",3218,4348],["Borzovka",5309,2809],["Kopachi",2721,6367],["Pogorevka",5007,2071],["Dobropole",4008,2128],["Pogorevka",1060,6248],["Kazachye Pole",4873,5842],["Stepanovka",1850,4409],["Cherno Mine",2169,3826],["Grachovka",5853,6334],["Kirovograd",1997,2111],["Matveyevka",6916,4090],["International Airport Matveyev",6871,5452],["Berezovsk",3953,3842],["Seversk",1856,7001]]
  },
  {
    id: "mogadishu", name: "Mogadishu", sizeX: 6144, sizeZ: 6144, official: false,
    // 3073 вершини x 2 м = 6144 м. Зображення карти — власна мозаїка користувача (2000x2000 м,
    // X 2000–4000, Z 2000–4000), прив'язана двома перетинами сітки; розмір терену тут справжній.
    places: [["West FOB",143,1055],["East FOB",5830,4156],["Old Town",1084,1535],["Mosque",3104,2522],["Hospital Area",3557,2649],["Sea Port",2770,2062],["Palm Town",4180,2975],["Construction Site",4828,3503],["Airport",1780,1767],["Hotel Area",2699,2566],["Bus Station",2680,2423],["Industrial Zone",2568,2075],["Favella Area",2983,2366],["Embassy District",3447,2429],["Wreck Yard",2572,2249],["Radio Station",2322,2342],["Mogadishu",2957,2671],["Metal Blocks",2754,2801],["Old Market",3019,2918],["Dry Fields",2472,2701],["Dry Riverbed",1832,2600],["Old Town",1937,4997],["Central District",2923,2529],["Artillery Hill",3889,3048],["Stone Ridge 1",3259,2829],["Stone Ridge 2",3063,2704],["Stone Ridge 3",2843,2654],["Wind Hill",2204,2098],["Dry Bush Ridge",816,2435],["Red Hill",5024,3602],["Xamar Tunnel",396,3124],["Buuro Tunnel",5892,4913],["Dry Bush Ridge",457,2215],["Dry Bush Ridge",307,1649],["Coastal Bunkers",671,1422],["Shore Battery",781,1146],["Wreck Beach",678,1045],["Quiet Beach",845,1214],["Sun Beach",2938,2254],["Sandy Beach",3628,2494],["Long Beach",4093,2802],["Wide Beach",5570,3654],["Old Eagle OP",2430,2770],["Stadium",3211,2931],["Old Depot",2816,3196]]
  },
  {
    id: "novyinovka", name: "Novyinovka", sizeX: 4096, sizeZ: 4096, official: false,
    // Мод «Novyinovka - Russia» (Itzz Coach, 689E376275A6AF90): 2049 вершини x 2 м = 4096 м.
    // Підписи — сутності Name Generic з шарів мода (без службових: назви мапи й автора).
    places: [["Military Scrap Yard",884,1501],["School",1929,2450],["Western Farm",395,966],["Generals Mansion",1444,1233],["Military Base",3384,2888],["Government",2022,2589],["Hospital",2114,2409],["Factory",1605,2967],["Eastern Farm",3235,1831],["Communication Tower",3166,1034],["City Center",2039,2087],["Trench FOB",951,2897]]
  }
];

const NAMESPACE_OVERRIDE = { kolguyev: "kolguev" };

const res = await fetch(ALL_MAPS_URL);
if (!res.ok) throw new Error(`Не вдалося завантажити ${ALL_MAPS_URL}: ${res.status}`);
const allMaps = await res.json();
const byNamespace = new Map(allMaps.map((m) => [m.namespace, m]));

const fromCatalog = BASE.map((t) => {
  const ns = NAMESPACE_OVERRIDE[t.id] ?? t.id;
  const src = byNamespace.get(ns);
  if (!src) throw new Error(`Терен "${t.id}" (namespace "${ns}") відсутній у all_arma_maps.json`);
  if (!t.sizeFromMod && (src.size[0] !== t.sizeX || src.size[1] !== t.sizeZ)) {
    throw new Error(
      `Розмір "${t.id}" розходиться з all_arma_maps.json: маю ${t.sizeX}x${t.sizeZ}, там ${src.size[0]}x${src.size[1]}`
    );
  }
  const { sizeFromMod, ...rest } = t; // sizeFromMod — лише службовий прапорець скрипта
  return {
    ...rest,
    mapImage: src.resources.map_image,
    heightData: src.resources.height_data ?? null
  };
});

const out = [...fromCatalog, ...MANUAL];

writeFileSync(
  new URL("../src/core/terrains-data.json", import.meta.url),
  JSON.stringify(out, null, 2) + "\n"
);
console.log(`Записано src/core/terrains-data.json: ${out.length} теренів.`);
