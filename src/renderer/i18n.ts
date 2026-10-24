export type Lang = "uk" | "en";

type Dict = Record<string, { uk: string; en: string }>;

const DICT: Dict = {
  appTitle: { uk: "Планшет мінометника", en: "Mortar Tablet" },
  prefetchHeading: { uk: "Карта без інтернету", en: "Map without internet" },
  prefetchHint: {
    uk: "Онлайн-тайли цього терену зберігаються на диск ПК, щоб карта відкривалась і без інтернету. Деталізація більша — файлів більше.",
    en: "Online tiles of this terrain are saved to the PC disk so the map opens without internet. Higher detail means more files."
  },
  prefetchGoBtn: { uk: "Зберегти на диск", en: "Save to disk" },
  prefetchProgress: { uk: "Збережено {done} з {total}", en: "Saved {done} of {total}" },
  prefetchDone: { uk: "Готово: {done} тайлів на диску, не вдалося {failed}.", en: "Done: {done} tiles on disk, {failed} failed." },
  prefetchCancelled: { uk: "Зупинено.", en: "Stopped." },
  offlineBtnAria: { uk: "Офлайн-режим", en: "Offline mode" },
  offlineTitle: { uk: "Офлайн-режим", en: "Offline mode" },
  offlineTerrainLabel: { uk: "Терен", en: "Terrain" },
  offlineLevelAria: { uk: "Деталізація", en: "Detail level" },
  offlineLevelLow: { uk: "Оглядова", en: "Overview" },
  offlineLevelMid: { uk: "Середня", en: "Medium" },
  offlineLevelHigh: { uk: "Детальна", en: "Detailed" },
  offlineLevelFull: { uk: "Максимальна", en: "Maximum" },
  offlineOpt: { uk: "{label}: {n} тайлів, ≈{mb} МБ", en: "{label}: {n} tiles, ≈{mb} MB" },
  offlineSaveBtn: { uk: "Зберегти карту", en: "Save map" },
  offlineStopBtn: { uk: "Зупинити", en: "Stop" },
  offlineProgress: { uk: "Збережено {done} з {total}", en: "Saved {done} of {total}" },
  offlineStopped: { uk: "Зупинено: збережено {done}.", en: "Stopped: {done} saved." },
  offlineFailed: { uk: "Не вдалося завантажити — перевірте зв'язок з ПК.", en: "Download failed — check the connection to the PC." },
  offlineDone: {
    uk: "Готово: збережено {done}. Немає на сервері: {missing} (це за межами карти, так і має бути). Помилок: {failed}.",
    en: "Done: {done} saved. Not on the server: {missing} (outside the map, expected). Errors: {failed}."
  },
  offlinePcTiles: { uk: "Онлайн-тайли цього терену зберігаються на диск ПК, щоб карта відкривалась без інтернету.", en: "Online tiles of this terrain are saved to the PC disk so the map opens without internet." },
  offlinePcLocal: { uk: "На ПК карта цього терену вже на диску й працює без інтернету.", en: "On the PC this terrain's map is already on disk and works without internet." },
  statusSaved: { uk: "Мітки збережено на цьому пристрої", en: "Marks are saved on this device" },
  terrainAriaLabel: { uk: "Терен", en: "Terrain" },
  markTypeAria: { uk: "Тип мітки", en: "Mark type" },
  canvasAriaLabel: {
    uk: "Карта. Перетягуйте, щоб рухати; колесо — масштаб; клік — навести приціл.",
    en: "Map. Drag to pan; wheel to zoom; click to move the crosshair."
  },
  zoomInAria: { uk: "Наблизити", en: "Zoom in" },
  zoomOutAria: { uk: "Віддалити", en: "Zoom out" },
  fitAria: { uk: "Уся карта", en: "Fit whole map" },
  placeBtn: { uk: "Поставити мітку", en: "Place mark" },
  fixPointBtn: { uk: "Зафіксувати точку {k}", en: "Fix point {k}" },
  unitM: { uk: "м", en: "m" },

  tabMarks: { uk: "Мітки", en: "Marks" },
  tabFire: { uk: "Розрахунок", en: "Solution" },
  tabLog: { uk: "Журнал", en: "Log" },
  tabSetup: { uk: "Карта", en: "Map" },

  folderLabel: { uk: "Папка / місія", en: "Folder / mission" },
  allFolders: { uk: "Усі папки", en: "All folders" },
  noFolder: { uk: "Без місії", en: "No mission" },
  addManualBtn: { uk: "Додати за координатами", en: "Add by coordinates" },
  emptyListFiltered: {
    uk: "У цій папці міток немає. Виберіть іншу або «Усі папки».",
    en: "No marks in this folder. Pick another one or “All folders”."
  },
  emptyListNone: {
    uk: "Міток ще немає. Наведіть приціл на місце на карті й натисніть «Поставити мітку».",
    en: "No marks yet. Aim the crosshair at a spot on the map and press “Place mark”."
  },
  badgeMortar: { uk: "М", en: "M" },
  badgeTarget: { uk: "Ц", en: "T" },
  badgePoint: { uk: "Т", en: "P" },
  copyBtn: { uk: "Копіювати", en: "Copy" },
  editBtn: { uk: "Змінити", en: "Edit" },
  copied: { uk: "Скопійовано", en: "Copied" },
  copyFromField: { uk: "Скопіюйте текст із поля", en: "Copy the text from the field" },

  typeMortar: { uk: "Міномет", en: "Mortar" },
  typeTarget: { uk: "Ціль", en: "Target" },
  typePoint: { uk: "Точка", en: "Point" },
  weaponM252: { uk: "M252 (США, 81 мм)", en: "M252 (US, 81 mm)" },
  weapon2B14: { uk: "2Б14 «Піднос» (82 мм)", en: "2B14 “Podnos” (82 mm)" },
  weaponShortM252: { uk: "M252", en: "M252" },
  weaponShort2B14: { uk: "2Б14", en: "2B14" },
  shellHE: { uk: "Осколково-фугасний", en: "High-Explosive" },
  shellSmoke: { uk: "Димовий", en: "Smoke" },
  shellIllumination: { uk: "Освітлювальний", en: "Illumination" },

  dlgTitleNew: { uk: "Нова мітка", en: "New mark" },
  dlgTitleEdit: { uk: "Змінити мітку", en: "Edit mark" },
  fieldName: { uk: "Назва", en: "Name" },
  fieldGrid: { uk: "Сітка (напр. 0483 1172) — заповнить X і Z", en: "Grid (e.g. 0483 1172) — fills X and Z" },
  fieldX: { uk: "X, м (схід)", en: "X, m (east)" },
  fieldZ: { uk: "Z, м (північ)", en: "Z, m (north)" },
  fieldHeight: { uk: "Висота, м", en: "Height, m" },
  heightOptional: { uk: "авто", en: "auto" },
  heightDetermining: { uk: "визначається…", en: "detecting…" },
  heightUnknown: { uk: "невідомо — вкажіть вручну", en: "unknown — enter manually" },
  fieldFolder: { uk: "Папка / місія", en: "Folder / mission" },
  folderPlaceholder: { uk: "без місії", en: "no mission" },
  deleteBtn: { uk: "Видалити", en: "Delete" },
  cancelBtn: { uk: "Скасувати", en: "Cancel" },
  saveBtn: { uk: "Зберегти", en: "Save" },
  fillXZorGrid: { uk: "Вкажіть X і Z або сітку", en: "Enter X and Z, or a grid reference" },
  markDeleted: { uk: "Мітку видалено", en: "Mark deleted" },
  markSaved: { uk: "Мітку збережено", en: "Mark saved" },
  markAdded: { uk: "Мітку додано", en: "Mark added" },
  aimAndFix: { uk: "Наведіть приціл на точку {k} і натисніть кнопку під картою", en: "Aim at point {k} and press the button under the map" },
  pointFixed: { uk: "Точку {k} зафіксовано — впишіть її координати", en: "Point {k} fixed — enter its coordinates" },

  centerName: { uk: "Центр прицілу", en: "Crosshair center" },
  centerOption: { uk: "Центр прицілу на карті", en: "Crosshair center on map" },
  fireFolderMortar: { uk: "Папка мінометів", en: "Mortar folder" },
  fireFolderTarget: { uk: "Папка цілей", en: "Target folder" },
  aboutAria: { uk: "Про програму", en: "About" },
  closeBtn: { uk: "Закрити", en: "Close" },
  copyManualTitle: { uk: "Скопіюйте вручну", en: "Copy manually" },
  copyManualLabel: { uk: "Виділіть і скопіюйте текст", en: "Select and copy the text" },
  immersiveAria: { uk: "Карта на весь екран", en: "Full-screen map" },
  immersiveExitAria: { uk: "Повернути інтерфейс", en: "Show interface" },
  noMortars: { uk: "Немає мінометів", en: "No mortars" },
  fireEmpty: {
    uk: "Додайте мітку типу «Міномет» — тоді тут з'являться азимут, заряд і кут підвищення.",
    en: "Add a “Mortar”-type mark — bearing, charge and elevation will appear here."
  },
  cellAzimuthDeg: { uk: "Азимут, градуси", en: "Bearing, degrees" },
  cellElevationMilsCharge: { uk: "Підвищення, мілі (заряд {c})", en: "Elevation, mils (charge {c})" },
  cellElevationMils: { uk: "Підвищення, мілі", en: "Elevation, mils" },
  cellRange: { uk: "Дальність", en: "Range" },
  cellHeightDiff: { uk: "Перевищення", en: "Height diff." },
  outOfRange: { uk: "Поза досяжністю {weapon} для цього снаряда: від {min} до {max} м.", en: "Out of range for {weapon} with this shell: {min} to {max} m." },
  colCharge: { uk: "Заряд", en: "Charge" },
  colTof: { uk: "Політ, с", en: "Flight, s" },
  bestChargeNote: { uk: "★ — найменший заряд, що дістає: найточніший варіант.", en: "★ — the smallest charge that reaches: the most accurate option." },
  noHeightNote: { uk: ". Без висот поправку на перевищення не враховано.", en: ". Without heights, the elevation-difference correction is not applied." },
  colRangeM: { uk: "Дальність, м", en: "Range, m" },
  colDeltaPer100: { uk: "Δ на 100 м висоти", en: "Δ per 100 m height" },
  tableCaption: { uk: "{weapon}, {shell} ({shellName}), заряд {level}. Виділено рядок, найближчий до поточної дальності.", en: "{weapon}, {shell} ({shellName}), charge {level}. Highlighted row is closest to the current range." },
  fireLabelMortar: { uk: "Міномет", en: "Mortar" },
  fireLabelTarget: { uk: "Ціль", en: "Target" },
  fireLabelShell: { uk: "Снаряд", en: "Shell" },
  fireTableSummary: { uk: "Таблиця стрільби", en: "Firing table" },
  fireLabelCharge: { uk: "Заряд", en: "Charge" },
  fireHint: {
    uk: "Кут підвищення враховує перевищення цілі, якщо в обох мітках указано висоту.",
    en: "Elevation accounts for target height difference when both marks have a height set."
  },

  mapImageHeading: { uk: "Зображення карти", en: "Map image" },
  mapImageHint: {
    uk: "Завантажте скріншот або супутникову карту терену. Без зображення працює порожня сітка — мітки можна ставити за координатами.",
    en: "Upload a screenshot or satellite image of the terrain. Without an image, a blank grid works fine — marks can still be placed by coordinates."
  },
  pickFileBtn: { uk: "Завантажити карту…", en: "Upload map…" },
  downloadImportBtn: { uk: "Завантажити й імпортувати", en: "Download and import" },
  clearMapBtn: { uk: "Прибрати карту", en: "Remove map" },
  showPlacesLabel: { uk: "Показувати назви пунктів", en: "Show place names" },
  placesBtnAria: { uk: "Назви пунктів: розмір і важливість", en: "Place names: size and importance" },
  fireShotBtn: { uk: "Постріл — запустити відлік", en: "Fire — start countdown" },
  shotInFlight: { uk: "Політ", en: "In flight" },
  shotImpact: { uk: "Влучання", en: "Impact" },
  shotSecUnit: { uk: "с", en: "s" },
  ringsLabel: { uk: "Кільця дальності на карті", en: "Range rings on the map" },
  lightLabel: { uk: "Економний режим (плавніше на слабкому телефоні)", en: "Light mode (smoother on a slow phone)" },
  lightAuto: { uk: "Карта гальмувала — увімкнено економний режим (вимкнути можна в «Aa»)", en: "The map was lagging — light mode enabled (turn it off in “Aa”)" },
  lightOn: { uk: "Економний режим увімкнено", en: "Light mode on" },
  lightOff: { uk: "Економний режим вимкнено", en: "Light mode off" },
  soundBtnAria: { uk: "Звук пострілу й влучання", en: "Shot and impact sound" },
  soundOn: { uk: "Звук увімкнено", en: "Sound on" },
  soundOff: { uk: "Звук вимкнено", en: "Sound off" },
  ringLabelCharge: { uk: "заряд {c}: {max} м", en: "charge {c}: {max} m" },
  ringLabelMin: { uk: "мін {min} м", en: "min {min} m" },
  extAdded: { uk: "додано: {list}", en: "added: {list}" },
  extChanged: { uk: "змінено: {list}", en: "changed: {list}" },
  extRemoved: { uk: "видалено: {list}", en: "removed: {list}" },
  extLog: { uk: "журнал +{n}", en: "log +{n}" },
  extMore: { uk: " і ще {n}", en: " and {n} more" },
  updCurrent: { uk: "Версія {v}", en: "Version {v}" },
  updChecking: { uk: "перевіряю оновлення…", en: "checking for updates…" },
  updAvailable: { uk: "доступна версія {v}, завантажую…", en: "version {v} available, downloading…" },
  updProgress: { uk: "завантаження {p}%", en: "downloading {p}%" },
  updReady: { uk: "версія {v} завантажена — перезапустіть, щоб оновитись", en: "version {v} downloaded — restart to update" },
  affFriend: { uk: "Свій", en: "Friend" },
  affHostile: { uk: "Чужий", en: "Hostile" },
  affAria: { uk: "Приналежність мітки", en: "Mark affiliation" },
  kindAria: { uk: "Вид мітки", en: "Mark kind" },
  kindInfantry: { uk: "Піхота", en: "Infantry" },
  kindArmour: { uk: "Броня", en: "Armour" },
  kindMortar: { uk: "Міномет", en: "Mortar" },
  kindHelicopter: { uk: "Гелікоптер", en: "Helicopter" },
  kindRetreat: { uk: "Відступ", en: "Retreat" },
  capInfantry: { uk: "Піхота: особовий склад, що діє пішки.", en: "Infantry: personnel on foot." },
  capArmour: { uk: "Броня: гусеничні бойові машини (танки, БМП).", en: "Armour: tracked combat vehicles (tanks, IFVs)." },
  capMortar: { uk: "Міномет: свій міномет — звідки йде розрахунок; чужий — ціль для вогню.", en: "Mortar: a friendly mortar is where the calculation starts; a hostile one is a fire target." },
  capHelicopter: { uk: "Гелікоптер: повітряна ціль або свій гелікоптер.", en: "Helicopter: an air threat or a friendly helicopter." },
  capRetreat: { uk: "Відступ: хрестик — точка, куди відходить підрозділ.", en: "Retreat: a cross marks the point a unit is falling back to." },
  fieldCaption: { uk: "Підпис", en: "Caption" },
  captionPlaceholder: { uk: "Коротко: що, скільки, куди", en: "Short note: what, how many, where" },
  legendTitle: { uk: "Умовні знаки", en: "Map symbols" },
  legendIntro: { uk: "Рамка показує, чия це мітка: синій прямокутник свої, червоний ромб чужі.", en: "The frame shows whose mark it is: a blue rectangle is friendly, a red diamond is hostile." },
  legendAria: { uk: "Що означають знаки", en: "What the symbols mean" },
  warnFriendlyTitle: { uk: "Свої поруч із ціллю: небезпечна зона {r} м (розкид {a} м + осколки {f} м)", en: "Friendlies near the target: danger area {r} m (dispersion {a} m + fragments {f} m)" },
  warnFriendlyItem: { uk: "«{name}»: {d} м від цілі, оновлено {age}", en: "“{name}”: {d} m from the target, updated {age}" },
  warnMore: { uk: "…і ще {n}", en: "…and {n} more" },
  logWarnItem: { uk: "Свої в небезпечній зоні: «{name}», {d} м від цілі (зона {r} м)", en: "Friendlies in the danger area: “{name}”, {d} m from the target (area {r} m)" },
  ageNow: { uk: "щойно", en: "just now" },
  ageMin: { uk: "{n} хв тому", en: "{n} min ago" },
  ageHour: { uk: "{n} год тому", en: "{n} h ago" },
  ageDay: { uk: "{n} дн тому", en: "{n} d ago" },
  markMoved: { uk: "Мітку «{n}» пересунуто", en: "“{n}” moved" },
  tabSquad: { uk: "Відділення", en: "Squad" },
  squadAdded: { uk: "{who}: нова мітка «{what}»", en: "{who} added “{what}”" },
  squadDenied: { uk: "Немає прав на цю зміну", en: "You are not allowed to do that" },
  squadRejected: { uk: "Сервер не прийняв зміну", en: "The server did not accept the change" },
  squadEnded: { uk: "Гру закінчено: зміни закриті", en: "The game is over: changes are closed" },
  squadKicked: { uk: "Вас вилучено з відділення", en: "You were removed from the squad" },
  squadGone: { uk: "Відділення видалено", en: "The squad was deleted" },
  squadVersion: { uk: "Ця версія застосунку не підходить до сервера відділення: оновіть застосунок", en: "This app version does not fit the squad server: update the app" },
  squadIntro: {
    uk: "Спільна карта міток для відділення: командир створює відділення, інші приєднуються за посиланням. Усі бачать мітки, мінометники й командир ще й розрахунок та журнал.",
    en: "A shared map of marks for a squad: the commander creates a squad, the others join by a link. Everyone sees the marks; mortarmen and the commander also get the solution and the log."
  },
  squadCallsign: { uk: "Ваш позивний", en: "Your callsign" },
  squadCallsignHint: { uk: "2–16 символів: літери, цифри, пробіл, - і _", en: "2–16 characters: letters, digits, space, - and _" },
  squadCreateBtn: { uk: "Створити відділення", en: "Create a squad" },
  squadCreateHint: { uk: "Відділення буде на карті «{terrain}».", en: "The squad will use the map “{terrain}”." },
  squadJoinLabel: { uk: "Посилання-запрошення", en: "Invitation link" },
  squadJoinBtn: { uk: "Приєднатися", en: "Join" },
  squadCreateHead: { uk: "Створити відділення", en: "Create a squad" },
  squadJoinHead: { uk: "Приєднатися за запрошенням", en: "Join by an invitation" },
  squadJoinTitle: { uk: "Приєднатися до відділення", en: "Join the squad" },
  squadJoinText: { uk: "Введіть свій позивний, і ви одразу зайдете у відділення.", en: "Enter your callsign and you will join the squad at once." },
  squadAlready: { uk: "Ви вже у відділенні: щоб приєднатися до іншого, спершу вийдіть", en: "You are already in a squad: leave it first to join another" },
  downloadAppBtn: { uk: "Завантажити застосунок", en: "Download the app" },
  squadWorking: { uk: "З'єднання…", en: "Connecting…" },
  squadErrBadCode: { uk: "Запрошення неправильне або застаріло", en: "The invitation is wrong or out of date" },
  squadErrBadCallsign: { uk: "Позивний: 2–16 символів, літери, цифри, пробіл, - і _", en: "Callsign: 2–16 characters, letters, digits, space, - and _" },
  squadErrTaken: { uk: "Такий позивний уже є у відділенні", en: "This callsign is already taken in the squad" },
  squadErrFull: { uk: "У відділенні вже 20 учасників", en: "The squad already has 20 members" },
  squadErrRemoved: { uk: "Вас вилучено з цього відділення", en: "You were removed from this squad" },
  squadErrEnded: { uk: "Гру вже закінчено", en: "The game is already over" },
  squadErrGone: { uk: "Такого відділення нема або його видалено", en: "There is no such squad or it was deleted" },
  squadErrLimit: { uk: "Забагато нових відділень сьогодні: спробуйте завтра", en: "Too many new squads today: try again tomorrow" },
  squadErrDisabled: { uk: "Створення нових відділень тимчасово вимкнено", en: "Creating new squads is temporarily switched off" },
  squadErrNetwork: { uk: "Нема зв'язку із сервером відділення", en: "No connection to the squad server" },
  squadErrInvite: { uk: "Встав посилання-запрошення повністю", en: "Paste the whole invitation link" },
  squadLinkOnline: { uk: "На зв'язку", en: "Online" },
  squadLinkConnecting: { uk: "З'єднання…", en: "Connecting…" },
  squadLinkOffline: { uk: "Без зв'язку: зміни збережуться й підуть, коли зв'язок повернеться", en: "Offline: changes are kept and sent when the connection returns" },
  squadPending: { uk: "Чекають надсилання: {n}", en: "Waiting to send: {n}" },
  squadYouAre: { uk: "Ви — {role} «{name}»", en: "You are {role} “{name}”" },
  roleCommander: { uk: "командир", en: "commander" },
  roleMortarman: { uk: "мінометник", en: "mortarman" },
  roleSoldier: { uk: "солдат", en: "soldier" },
  squadMapLine: { uk: "Карта відділення: {terrain}", en: "Squad map: {terrain}" },
  squadMapSwitch: { uk: "Перейти на карту відділення", en: "Go to the squad map" },
  squadMapSet: { uk: "Зробити поточну карту картою відділення", en: "Make this map the squad map" },
  squadMapUnknown: { uk: "(цієї карти нема на пристрої)", en: "(this map is not on this device)" },
  squadInviteTitle: { uk: "Запрошення", en: "Invitation" },
  squadInviteCopy: { uk: "Скопіювати посилання", en: "Copy the link" },
  squadInviteShare: { uk: "Поділитися…", en: "Share…" },
  squadInviteRotate: { uk: "Замінити код запрошення", en: "Replace the invitation code" },
  squadInviteRotated: { uk: "Код замінено: старе посилання більше не працює", en: "Code replaced: the old link no longer works" },
  squadInviteHidden: { uk: "Посилання бачить той, хто створив відділення або замінив код.", en: "The link is shown to the one who created the squad or replaced the code." },
  squadMembers: { uk: "Учасники ({n})", en: "Members ({n})" },
  squadRemovedHead: { uk: "Вилучені", en: "Removed" },
  squadRemoveBtn: { uk: "Вилучити", en: "Remove" },
  squadRestoreBtn: { uk: "Відновити", en: "Restore" },
  squadRemoveTitle: { uk: "Вилучити «{name}»?", en: "Remove “{name}”?" },
  squadRemoveText: { uk: "Учасник втратить доступ. Його мітки лишаться. Пізніше його можна відновити.", en: "The member loses access. Their marks stay. You can restore them later." },
  squadHandoverTitle: { uk: "Передати командування «{name}»?", en: "Hand the command over to “{name}”?" },
  squadHandoverText: { uk: "Ви станете мінометником.", en: "You will become a mortarman." },
  squadShareMarks: { uk: "Додати мої локальні мітки до відділення", en: "Add my local marks to the squad" },
  squadShared: { uk: "Додано міток: {n}", en: "Marks added: {n}" },
  squadEndBtn: { uk: "Гра закінчена", en: "Game over" },
  squadEndTitle: { uk: "Закінчити гру?", en: "End the game?" },
  squadEndText: { uk: "Мітки й журнал стануть лише для читання. Відновити гру не можна.", en: "Marks and the log become read-only. The game cannot be resumed." },
  squadDeleteBtn: { uk: "Видалити відділення", en: "Delete the squad" },
  squadDeleteTitle: { uk: "Видалити відділення?", en: "Delete the squad?" },
  squadDeleteText: { uk: "Сервер видалить усе про відділення, усіх учасників буде відключено. Мітки лишаться в тебе на пристрої.", en: "The server deletes everything about the squad and disconnects everyone. The marks stay on your device." },
  squadLeaveBtn: { uk: "Вийти з відділення", en: "Leave the squad" },
  squadLeaveTitle: { uk: "Вийти з відділення?", en: "Leave the squad?" },
  squadLeaveText: { uk: "Ви перестанете бачити нові зміни. Повернутися можна за посиланням.", en: "You will stop seeing new changes. You can come back by the link." },
  squadKeepTitle: { uk: "Мітки відділення", en: "The squad marks" },
  squadKeepText: { uk: "Залишити мітки відділення в себе як локальні? «Ні» — прибрати їх із цього пристрою.", en: "Keep the squad marks on this device as local marks? “No” removes them from this device." },
  squadKeepYes: { uk: "Залишити", en: "Keep" },
  squadOnlineDot: { uk: "на зв'язку", en: "online" },
  squadAuthor: { uk: "{who}, {age}", en: "{who}, {age}" },
  squadYouLabel: { uk: "ви", en: "you" },
  squadLocalHint: { uk: "Нові мітки на карті відділення стають спільними; мітки на інших картах лишаються локальними.", en: "New marks on the squad map become shared; marks on other maps stay local." },
  squadSoldierHint: { uk: "Солдат бачить усі мітки, ставить свої й ворожі, рухає будь-які; розрахунок і журнал — для мінометників і командира.", en: "A soldier sees all marks, places friendly and hostile ones and moves any; the solution and the log are for mortarmen and the commander." },
  squadEndedBanner: { uk: "Гру закінчено. Мітки й журнал закриті, нижче звіт.", en: "The game is over. Marks and the log are closed; the report is below." },
  squadRemovedBanner: { uk: "Вас вилучено з відділення. Командир може відновити доступ.", en: "You were removed from the squad. The commander can restore your access." },
  squadRetryBtn: { uk: "Спробувати знову", en: "Try again" },
  repDefaultTitle: { uk: "Звіт про гру", en: "Game report" },
  repTerrain: { uk: "Карта", en: "Map" },
  repPeriod: { uk: "Час гри", en: "Game time" },
  repTotals: { uk: "Підсумки", en: "Totals" },
  repLive: { uk: "Міток на карті", en: "Marks on the map" },
  repDestroyed: { uk: "Позначено знищеними", en: "Marked destroyed" },
  repDeleted: { uk: "Видалено під час гри", en: "Deleted during the game" },
  repFire: { uk: "Вогневих завдань", en: "Fire missions" },
  repWarnings: { uk: "попереджень про своїх", en: "friendly-fire warnings" },
  repMembers: { uk: "Учасники", en: "Members" },
  repColCallsign: { uk: "Позивний", en: "Callsign" },
  repColRole: { uk: "Роль", en: "Role" },
  repColMarks: { uk: "Міток", en: "Marks" },
  repColHostile: { uk: "Ворожих", en: "Hostile" },
  repColFriend: { uk: "Своїх", en: "Friendly" },
  repColDestroyed: { uk: "Знищено", en: "Destroyed" },
  repColFire: { uk: "Завдань", en: "Missions" },
  repMarks: { uk: "Мітки", en: "Marks" },
  repColMark: { uk: "Мітка", en: "Mark" },
  repColKind: { uk: "Знак", en: "Symbol" },
  repColGrid: { uk: "Квадрат", en: "Grid" },
  repColAuthor: { uk: "Автор", en: "Author" },
  repColTime: { uk: "Час", en: "Time" },
  repColState: { uk: "Стан", en: "State" },
  repStateDestroyed: { uk: "знищено", en: "destroyed" },
  repStateDeleted: { uk: "видалено", en: "deleted" },
  repStateOk: { uk: "діє", en: "active" },
  repRemoved: { uk: "вилучено", en: "removed" },
  repFireTitle: { uk: "Вогневі завдання", en: "Fire missions" },
  repColMortar: { uk: "Міномет", en: "Mortar" },
  repColTarget: { uk: "Ціль", en: "Target" },
  repColShell: { uk: "Снаряд / заряд", en: "Shell / charge" },
  repColAzimuth: { uk: "Азимут, мілі", en: "Azimuth, mils" },
  repColElevation: { uk: "Підвищення", en: "Elevation" },
  repColRange: { uk: "Дальність, м", en: "Range, m" },
  repTimeline: { uk: "Хронологія", en: "Timeline" },
  repEvJoined: { uk: "{who} приєднався до відділення", en: "{who} joined the squad" },
  repEvMark: { uk: "{who} позначив: {what} ({aff}, {grid})", en: "{who} marked: {what} ({aff}, {grid})" },
  repEvUpdated: { uk: "{who} змінив мітку: {what}", en: "{who} changed the mark: {what}" },
  repEvDeleted: { uk: "{who} видалив мітку: {what}", en: "{who} deleted the mark: {what}" },
  repEvFire: { uk: "{who} записав вогневе завдання: {mortar} → {target}", en: "{who} logged a fire mission: {mortar} → {target}" },
  repNotes: { uk: "Нотатки", en: "Notes" },
  repFooter: { uk: "Створено в застосунку «Планшет мінометника»", en: "Created in the Mortar Tablet app" },
  repHeading: { uk: "Звіт про гру", en: "Game report" },
  repTitleLabel: { uk: "Заголовок", en: "Title" },
  repNotesLabel: { uk: "Нотатки до звіту", en: "Report notes" },
  repSaveJson: { uk: "Зберегти звіт (файл)", en: "Save the report (file)" },
  repSavePrint: { uk: "Зберегти для друку (HTML)", en: "Save for printing (HTML)" },
  repOpenFile: { uk: "Відкрити звіт із файлу", en: "Open a report file" },
  repClose: { uk: "Закрити звіт", en: "Close the report" },
  repBadFile: { uk: "Це не файл звіту", en: "This is not a report file" },
  repAskTitle: { uk: "Зберегти звіт і видалити відділення?", en: "Save the report and delete the squad?" },
  repAskText: { uk: "Після збереження файлу сервер видалить усе про відділення, учасників буде відключено. Звіт лишиться у файлі й на цьому пристрої.", en: "After the file is saved the server deletes everything about the squad and disconnects everyone. The report stays in the file and on this device." },
  repAskYes: { uk: "Зберегти й видалити", en: "Save and delete" },
  repExported: { uk: "Звіт збережено, відділення видалено з сервера", en: "Report saved, the squad was deleted from the server" },
  repEditHint: { uk: "Звіт можуть правити командир і ті, кому він дозволив. Зміни бачать усі. Через 24 години після кінця гри сервер видалить усе сам.", en: "The commander and those allowed by them can edit the report; everyone sees the changes. 24 hours after the game ends the server deletes everything." },
  repReadOnly: { uk: "Звіт лише для перегляду.", en: "This report is read-only." },
  repFileHint: { uk: "Звіт збережено на цьому пристрої. Збережіть файл, щоб мати його й надалі.", en: "The report is kept on this device. Save the file to keep it for good." },
  repMarkExclude: { uk: "Виключити зі звіту", en: "Exclude from the report" },
  repMarkDestroyed: { uk: "Знищено", en: "Destroyed" },
  repMarkName: { uk: "Назва", en: "Name" },
  repMarkCaption: { uk: "Підпис", en: "Caption" },
  repShowMarks: { uk: "Мітки ({n})", en: "Marks ({n})" },
  repShowFire: { uk: "Вогневі завдання ({n})", en: "Fire missions ({n})" },
  repShowTimeline: { uk: "Хронологія ({n})", en: "Timeline ({n})" },
  squadEditorToggle: { uk: "Може правити звіт", en: "May edit the report" },
  squadWhoLog: { uk: "записав {who}", en: "logged by {who}" },
  extOtherTab: { uk: "З іншої вкладки", en: "From another tab" },
  updManual: { uk: "доступна версія {v} — завантажте її зі сторінки релізів", en: "version {v} is available — download it from the releases page" },
  updOpenPage: { uk: "Відкрити сторінку завантаження", en: "Open the download page" },
  updNone: { uk: "встановлена остання версія", en: "you have the latest version" },
  updError: { uk: "не вдалося перевірити оновлення", en: "could not check for updates" },
  updUnsupported: { uk: "автооновлення недоступне (portable або режим розробки)", en: "auto-update is unavailable (portable or dev mode)" },
  updCheckBtn: { uk: "Перевірити оновлення", en: "Check for updates" },
  updInstallBtn: { uk: "Перезапустити й оновити", en: "Restart and update" },
  exportBtn: { uk: "Експорт…", en: "Export…" },
  importFolderBtn: { uk: "Імпорт…", en: "Import…" },
  exportTitle: { uk: "Експорт міток", en: "Export marks" },
  exTargets: { uk: "Цілі", en: "Targets" },
  exPoints: { uk: "Точки", en: "Points" },
  exMortars: { uk: "Міномети", en: "Mortars" },
  exLink: { uk: "Копіювати посилання", en: "Copy link" },
  exQr: { uk: "Показати QR", en: "Show QR" },
  exQrHint: {
    uk: "Наведіть камеру телефона на QR: відкриється посилання й застосунок запропонує імпорт.",
    en: "Point the phone camera at the QR: the link opens and the app offers to import."
  },
  exQrTooBig: {
    uk: "Міток забагато для QR. Скопіюйте посилання або збережіть файл.",
    en: "Too many marks for a QR. Copy the link or save a file."
  },
  imPaste: { uk: "Вставити з буфера", en: "Paste from clipboard" },
  imLinkHint: {
    uk: "Є посилання від іншого пристрою? Вставте його сюди.",
    en: "Got a link from another device? Paste it here."
  },
  shareBad: { uk: "Посилання пошкоджене або не від цього застосунку.", en: "The link is damaged or not from this app." },
  pasteFailed: { uk: "Не вдалося прочитати буфер: вставте вручну.", en: "Could not read the clipboard: paste manually." },
  webUpdAvailable: { uk: "Вийшла нова версія {v}", en: "New version {v} is available" },
  updDownload: { uk: "Завантажити", en: "Download" },
  updReloadText: { uk: "Є оновлена версія застосунку", en: "An updated version is ready" },
  updReload: { uk: "Оновити", en: "Update" },
  updClose: { uk: "Закрити", en: "Dismiss" },
  fieldDestroyed: { uk: "Зруйновано (відмічено вручну)", en: "Destroyed (marked manually)" },
  destroyBtn: { uk: "Позначити зруйнованою", en: "Mark as destroyed" },
  restoreBtn: { uk: "Повернути (не зруйновано)", en: "Restore (not destroyed)" },
  markDestroyed: { uk: "Зруйновано: {n}", en: "Destroyed: {n}" },
  markRestored: { uk: "Повернуто: {n}", en: "Restored: {n}" },
  spreadShow: { uk: "Показувати розкид на карті", en: "Show dispersion on the map" },
  spreadLen: { uk: "Уздовж вогню, % дальності", en: "Along fire, % of range" },
  spreadWid: { uk: "Упоперек, % дальності", en: "Across, % of range" },
  spreadAuto: { uk: "Оцінка за даними гри (залежить від заряду)", en: "Estimate from game data (depends on charge)" },
  spreadAutoNow: {
    uk: "За даними гри: ±{a} м за дальністю (заряд {c}). Бокового розкиду в даних нема: еліпс умовно вузький. Значення варто звірити в грі.",
    en: "From game data: ±{a} m in range (charge {c}). No lateral dispersion in the data: the ellipse is drawn narrow. Verify in the game."
  },
  spreadNoData: { uk: "Для цього пострілу даних гри нема.", en: "No game data for this shot." },
  spreadNow: { uk: "Радіуси розкиду: {a} × {b} м", en: "Dispersion radii: {a} × {b} m" },
  spreadEmpty: { uk: "Задайте значення (з гри чи досвіду): розкид у таблицях балістики відсутній.", en: "Enter values (from the game or experience): the ballistic tables have no dispersion." },
  destroyedLabel: { uk: "Зруйновано", en: "Destroyed" },
  themeBtnAria: { uk: "Колірна тема", en: "Color theme" },
  themeGreen: { uk: "Зелена", en: "Green" },
  themeRed: { uk: "Червона", en: "Red" },
  themeBlue: { uk: "Синя", en: "Blue" },
  settingsAria: { uk: "Налаштування", en: "Settings" },
  settingsTitle: { uk: "Налаштування", en: "Settings" },
  settingsSearch: { uk: "Пошук", en: "Search" },
  settingsNoResults: { uk: "Нічого не знайдено.", en: "Nothing found." },
  secView: { uk: "Вигляд", en: "Appearance" },
  secSound: { uk: "Звук і відгук", en: "Sound and feedback" },
  secCalc: { uk: "Розрахунок", en: "Calculation" },
  secData: { uk: "Карти й дані", en: "Maps and data" },
  secBackup: { uk: "Резервні копії", en: "Backups" },
  secAbout: { uk: "Оновлення й про програму", en: "Updates and about" },
  setTheme: { uk: "Колірна тема", en: "Colour theme" },
  setLanguage: { uk: "Мова", en: "Language" },
  setSoundOn: { uk: "Звук пострілу й влучання", en: "Shot and impact sound" },
  setVolume: { uk: "Гучність", en: "Volume" },
  setSoundTest: { uk: "Перевірити звук", en: "Test sound" },
  setVibration: { uk: "Вібрація при пострілі", en: "Vibrate on shot" },
  setVibrationIos: { uk: "На iPhone замість вібрації короткий тактильний відгук (потрібен iOS 17.4 або новіший).", en: "On iPhone this is a short haptic tap instead of vibration (needs iOS 17.4 or newer)." },
  setVibrationNone: { uk: "Цей пристрій не підтримує вібрацію.", en: "This device does not support vibration." },
  setAwake: { uk: "Не гасити екран, поки застосунок відкрито", en: "Keep the screen on while the app is open" },
  setSpread: { uk: "Розкид снарядів", en: "Shell dispersion" },
  setSpreadHint: { uk: "Дані гри стосуються лише осколково-фугасних мін. У ручному режимі радіуси задаються у відсотках дальності окремо для кожного міномета.", en: "Game data covers high-explosive rounds only. In manual mode the radii are set as a percentage of range for each mortar separately." },
  setShells: { uk: "Доступні снаряди", en: "Available shells" },
  setShellsHint: { uk: "Вимкнені снаряди не показуються у списку «Снаряд». Типовий снаряд підставляється при виборі міномета.", en: "Disabled shells are hidden from the Shell list. The default shell is picked when you choose a mortar." },
  setShellDefault: { uk: "Типовий снаряд", en: "Default shell" },
  setUpdNotice: { uk: "Повідомляти про нову версію", en: "Notify about new versions" },
  setAboutTitle: { uk: "Про програму", en: "About" },
  setAboutHint: { uk: "Можливості, перевірка оновлень, ліцензії та подяки", en: "Features, update check, licences and credits" },
  setAboutOpen: { uk: "Про програму, перевірка оновлень і ліцензії…", en: "About, update check and licences…" },
  setReset: { uk: "Скинути розділ", en: "Reset section" },
  setResetTitle: { uk: "Скинути розділ?", en: "Reset section?" },
  setResetText: { uk: "Налаштування розділу повернуться до типових. Мітки й карти не зачіпаються.", en: "This section's settings return to defaults. Marks and maps are not affected." },
  setResetDone: { uk: "Розділ скинуто", en: "Section reset" },
  setVersion: { uk: "Версія {v}", en: "Version {v}" },
  spreadOffNote: { uk: "Розкид вимкнено. Увімкнути можна в налаштуваннях.", en: "Dispersion is off. You can enable it in settings." },
  spreadSettingsBtn: { uk: "Налаштувати розкид…", en: "Dispersion settings…" },
  storageHeading: { uk: "Завантажені дані", en: "Downloaded data" },
  storageHint: {
    uk: "Кеш онлайн-тайлів, імпортовані карти й висоти займають місце на диску. Тут видно, скільки, і можна видалити окремо для кожного терену.",
    en: "Online tile caches, imported maps and heights take disk space. See how much and delete them per terrain."
  },
  storageOpenBtn: { uk: "Відкрити менеджер", en: "Open manager" },
  storageRootLabel: { uk: "Папка даних", en: "Data folder" },
  storageRootChange: { uk: "Змінити папку…", en: "Change folder…" },
  storageRootReset: { uk: "Типова папка", en: "Default folder" },
  storageRootTitle: { uk: "Перенести дані?", en: "Move the data?" },
  storageRootText: { uk: "Завантажені карти, тайли й висоти буде перенесено в папку «{path}». Це може тривати кілька хвилин, а потім старі файли буде видалено.", en: "The downloaded maps, tiles and heights will be moved to “{path}”. It can take a few minutes, then the old files are deleted." },
  storageRootTextDefault: { uk: "Завантажені дані буде повернено в типову папку застосунку. Це може тривати кілька хвилин.", en: "The downloaded data will be moved back to the app's default folder. It can take a few minutes." },
  storageRootGo: { uk: "Перенести", en: "Move" },
  storageRootMoving: { uk: "Переношу файли… не закривайте застосунок", en: "Moving the files… do not close the app" },
  storageRootMoved: { uk: "Готово: нові завантаження йдуть у цю папку", en: "Done: new downloads go to this folder" },
  storageTitle: { uk: "Завантажені дані", en: "Downloaded data" },
  storageRefreshBtn: { uk: "Оновити", en: "Refresh" },
  storageLoading: { uk: "Рахую розміри…", en: "Measuring…" },
  storageEmpty: { uk: "Нічого не завантажено.", en: "Nothing downloaded." },
  storageMap: { uk: "Імпортована карта", en: "Imported map" },
  storageTiles: { uk: "Кеш онлайн-тайлів", en: "Online tile cache" },
  storageHeights: { uk: "Висоти", en: "Heights" },
  storageFiles: { uk: "файлів", en: "files" },
  storageTotal: { uk: "Разом: {size}", en: "Total: {size}" },
  storageDeleteTitle: { uk: "Видалити?", en: "Delete?" },
  storageDeleteText: { uk: "{what} для «{name}» буде видалено з диска. Це можна завантажити знову.", en: "{what} for “{name}” will be deleted from disk. You can download it again." },
  storageDeleted: { uk: "Видалено", en: "Deleted" },
  unitMb: { uk: "МБ", en: "MB" },
  unitGb: { uk: "ГБ", en: "GB" },
  exCount: { uk: "У файлі буде міток: {n}", en: "Marks in the export: {n}" },
  exEmpty: { uk: "У цій папці немає міток вибраних типів", en: "No marks of the chosen types in this folder" },
  exShare: { uk: "Поділитись", en: "Share" },
  exFile: { uk: "Зберегти файл", en: "Save file" },
  exSaved: { uk: "Файл збережено: {f}", en: "File saved: {f}" },
  importTitle: { uk: "Імпорт міток", en: "Import marks" },
  imIntro: {
    uk: "Вставте текст, отриманий через «Експорт», або виберіть файл. Повторний імпорт нічого не дублює: наявні мітки оновлюються за id.",
    en: "Paste text obtained via “Export” or pick a file. Importing again does not duplicate: existing marks are updated by id."
  },
  imPlaceholder: { uk: "Вставте текст обміну", en: "Paste the exchange text" },
  imPick: { uk: "Вибрати файл…", en: "Choose file…" },
  imDest: { uk: "Папка призначення", en: "Destination folder" },
  imKeep: { uk: "Як у файлі", en: "As in the file" },
  imNewFolder: { uk: "Нова папка…", en: "New folder…" },
  imNewName: { uk: "Назва нової папки", en: "New folder name" },
  imGo: { uk: "Імпортувати", en: "Import" },
  imHint: { uk: "Вставте текст обміну або виберіть файл.", en: "Paste the exchange text or choose a file." },
  imBadJson: { uk: "Це не схоже на файл обміну (не JSON).", en: "This does not look like an exchange file (not JSON)." },
  imBadShape: { uk: "У тексті немає списку міток.", en: "No list of marks in the text." },
  imNone: { uk: "У тексті немає жодної коректної мітки.", en: "No valid marks in the text." },
  imFolderInfo: { uk: "папка «{f}»", en: "folder “{f}”" },
  imCounts: { uk: "цілей {t}, точок {p}, мінометів {m}", en: "targets {t}, points {p}, mortars {m}" },
  imSkipped: { uk: "пропущено некоректних: {n}", en: "skipped invalid: {n}" },
  imTerrainMismatch: {
    uk: "Файл для терену «{from}», а відкрито «{to}»: координати можуть не збігатися.",
    en: "The file is for terrain “{from}”, but “{to}” is open: coordinates may not match."
  },
  imMismatchTitle: { uk: "Інший терен", en: "Different terrain" },
  imAnyway: { uk: "Імпортувати все одно", en: "Import anyway" },
  imDone: { uk: "Імпорт: нових {a}, оновлено {u}, без змін {s}", en: "Import: {a} new, {u} updated, {s} unchanged" },
  placesHeading: { uk: "Назви пунктів", en: "Place names" },
  calibSummarySize: { uk: "Уся карта · {x}×{z} м", en: "Whole map · {x}×{z} m" },
  calibSummaryPts: { uk: "Дві точки", en: "Two points" },
  placeKind_settlement: { uk: "Населені пункти", en: "Settlements" },
  placeKind_military: { uk: "Військові", en: "Military" },
  placeKind_transport: { uk: "Транспорт", en: "Transport" },
  placeKind_industry: { uk: "Промисловість", en: "Industry" },
  placeKind_water: { uk: "Вода, узбережжя", en: "Water, coast" },
  placeKind_nature: { uk: "Місцевість", en: "Terrain" },
  placesSizeLabel: { uk: "Розмір назв", en: "Name size" },
  placesLevelLabel: { uk: "Показувати", en: "Show" },
  placesLevel1: { uk: "Лише головні", en: "Major only" },
  placesLevel2: { uk: "Головні й звичайні", en: "Major and regular" },
  placesLevel3: { uk: "Усі", en: "All" },
  delTerrainBtn: { uk: "Видалити цей терен зі списку", en: "Remove this terrain from the list" },
  coordBindingHeading: { uk: "Прив'язка координат", en: "Coordinate binding" },
  coordBindingAria: { uk: "Спосіб прив'язки", en: "Binding method" },
  modeSizeBtn: { uk: "Уся карта", en: "Whole map" },
  modePtsBtn: { uk: "Дві точки", en: "Two points" },
  sizeHint: {
    uk: "Зображення охоплює весь терен від лівого нижнього кута (0, 0). Вкажіть розмір терену в метрах.",
    en: "The image covers the whole terrain starting at the bottom-left corner (0, 0). Enter the terrain size in meters."
  },
  fieldSizeX: { uk: "Ширина X, м", en: "Width X, m" },
  fieldSizeZ: { uk: "Висота Z, м", en: "Height Z, m" },
  labelXm: { uk: "X, м", en: "X, m" },
  labelZm: { uk: "Z, м", en: "Z, m" },
  presetSizeBtn: { uk: "Стандарт", en: "Default" },
  ptsHint: {
    uk: "Наведіть приціл на точку, координати якої знаєте (перетин ліній сітки, кут квадрата), зафіксуйте її і впишіть координати. Дві точки мають бути далеко одна від одної по обох осях.",
    en: "Aim the crosshair at a point whose coordinates you know (a grid intersection, a square's corner), fix it, then enter its coordinates. The two points should be far apart on both axes."
  },
  backupHeading: { uk: "Резервна копія", en: "Backup" },
  backupHint: {
    uk: "Мітки зберігаються автоматично. Тут можна скопіювати їх як текст або вставити раніше скопійовані.",
    en: "Marks are saved automatically. Here you can copy them as text or paste previously copied ones."
  },
  jsonPlaceholder: { uk: "Вставте JSON, щоб імпортувати", en: "Paste JSON here to import" },
  copyMarksBtn: { uk: "Копіювати мітки", en: "Copy marks" },
  importBtn: { uk: "Імпортувати", en: "Import" },
  wipeBtn: { uk: "Видалити всі мітки", en: "Delete all marks" },
  importedNotMarks: { uk: "Не схоже на скопійовані мітки — перевірте текст", en: "Doesn't look like copied marks — check the text" },
  importedCount: { uk: "Імпортовано міток: {n}", en: "Marks imported: {n}" },
  wipeTitle: { uk: "Видалити всі мітки?", en: "Delete all marks?" },
  wipeText: { uk: "Буде видалено міток: {n} на терені {terrain}.", en: "{n} marks on {terrain} will be deleted." },

  sheetToggleAria: { uk: "Згорнути/розгорнути панель", en: "Collapse/expand panel" },
  storageFailed: {
    uk: "Не вдалося зберегти: сховище браузера заповнене або вимкнене. Зробіть експорт міток.",
    en: "Could not save: browser storage is full or disabled. Export your markers."
  },
  heightFromTerrain: { uk: "Висоту (однієї чи обох точок) взято з даних рельєфу карти.", en: "Height (of one or both points) taken from the map's terrain data." },
  calibGridLabel: {
    uk: "Перетин сітки з карти (напр. 030 029) — заповнить X і Z",
    en: "Grid intersection from the map (e.g. 030 029) — fills X and Z"
  },
  calibGridBad: { uk: "Не схоже на підпис сітки: дві групи цифр однакової довжини", en: "Not a grid reference: two digit groups of equal length" },
  pointLabel: { uk: "Точка {k}", en: "Point {k}" },
  pointNotFixed: { uk: " — не зафіксована", en: " — not fixed" },
  refixBtn: { uk: "Перезафіксувати", en: "Re-fix" },
  aimBtn: { uk: "Навести приціл", en: "Aim crosshair" },

  groupOfficial: { uk: "Офіційні", en: "Official" },
  groupMods: { uk: "Мод-карти", en: "Mod maps" },
  groupCustom: { uk: "Мої", en: "Mine" },
  addOtherTerrain: { uk: "+ Інший терен…", en: "+ Other terrain…" },
  otherTerrainTitle: { uk: "Інший терен", en: "Other terrain" },
  otherTerrainText: { uk: "Для терену з моду. Розмір можна змінити пізніше у вкладці «Карта».", en: "For a mod terrain. The size can be changed later in the “Map” tab." },
  addBtn: { uk: "Додати", en: "Add" },
  fieldTerrainName: { uk: "Назва", en: "Name" },
  fieldTerrainSize: { uk: "Розмір, м", en: "Size, m" },
  terrainAdded: { uk: "Додано «{name}» — завантажте для нього карту", en: "Added “{name}” — upload a map for it" },
  delTerrainTitle: { uk: "Видалити терен?", en: "Delete terrain?" },
  delTerrainText: { uk: "«{name}» зникне зі списку разом з мітками і картою.", en: "“{name}” will disappear from the list along with its marks and map." },

  aboutLicenses: { uk: "Ліцензії та подяки", en: "Licences and credits" },
  aboutHtml: {
    uk: `<h2>Про програму</h2>
    <p class="hint">Планшет мінометника для Arma Reforger: розрахунок вогню з мінометів M252 і 2Б14 прямо на карті. Некомерційний застосунок для особистого й ігрового використання.</p>
    <h2>Що вміє</h2>
    <ul class="about-list">
      <li><b>Карта.</b> Everon, Arland, Kolguyev і карти популярних модів; масштабування, сітка з координатами, назви пунктів, кільця дальності, контури будівель. Тап по будівлі наводить на неї приціл.</li>
      <li><b>Мітки.</b> Міномети, цілі й точки, розкладені по папках-місіях; зруйновані цілі позначаються на карті. Висоти беруться з даних рельєфу.</li>
      <li><b>Розрахунок.</b> Дальність, азимут у мілах, кут підвищення, заряд (★ — найкращий), час польоту й поправка на висоту. Осколково-фугасний, освітлювальний і димовий снаряди, розкид, журнал стрільби.</li>
      <li><b>Постріл.</b> Анімація польоту снаряда з гуркотом і влученням, прив'язаними до прильоту.</li>
      <li><b>Відділення.</b> Спільна карта міток у реальному часі: командир створює відділення, інші заходять за посиланням чи QR-кодом; ролі командира, мінометника й солдата, свої й чужі знаки з підписами, журнал стрільби для мінометників, звіт після гри. Обмін мітками посиланням, резервні копії.</li>
      <li><b>Для слабких телефонів.</b> Економний режим: плавніше малює карту, підписи лишаються чіткими.</li>
      <li><b>Скрізь.</b> Windows, сайт (його можна встановити як застосунок) і Android; мови — українська й англійська; три темні колірні теми.</li>
    </ul>
    <h2>Налаштування</h2>
    <p class="hint">Усе налаштовується в розділі ⚙ у шапці: тема, мова, звук і вібрація, доступні снаряди, розкид, карти й дані, мережа.</p>
    <p class="hint">Назви пунктів, розміри теренів і висоти походять із матеріалів гри та відповідних модів. Автори, ліцензії та статус перевірки прав наведені в розділі «Ліцензії та подяки».</p>`,
    en: `<h2>About</h2>
    <p class="hint">A mortar tablet for Arma Reforger: fire solutions for the M252 and 2B14 mortars right on the map. A non-commercial app for personal and in-game use.</p>
    <h2>What it does</h2>
    <ul class="about-list">
      <li><b>Map.</b> Everon, Arland, Kolguyev and popular mod maps; zoom, coordinate grid, place names, range rings, building outlines. Tap a building to aim at it.</li>
      <li><b>Marks.</b> Mortars, targets and points organised in mission folders; destroyed targets are marked on the map. Heights come from terrain data.</li>
      <li><b>Solutions.</b> Range, azimuth in mils, elevation, charge (★ is the best), time of flight and height correction. High-explosive, illumination and smoke shells, dispersion, a firing log.</li>
      <li><b>Shot.</b> A shell flight animation with the boom and impact timed to the landing.</li>
      <li><b>Squad mode.</b> A shared live map of marks: the commander creates a squad, the others join by a link or QR code; commander, mortarman and soldier roles, friendly and hostile symbols with captions, a firing log for mortarmen, a report after the game. Share marks by link, backups.</li>
      <li><b>Weak phones.</b> A light mode that draws the map more smoothly while keeping labels sharp.</li>
      <li><b>Everywhere.</b> Windows, the website (installable as an app) and Android; Ukrainian and English; three dark colour themes.</li>
    </ul>
    <h2>Settings</h2>
    <p class="hint">Everything is configured under ⚙ in the header: theme, language, sound and vibration, available shells, dispersion, maps and data, network.</p>
    <p class="hint">Place names, terrain sizes and heights originate from the game and the respective mods. Authors, licenses and the status of the rights review are listed under Licences and credits.</p>`
  },

  importPhaseDownload: { uk: "Завантаження зображення", en: "Downloading image" },
  importPhaseTiling: { uk: "Нарізка на тайли", en: "Slicing into tiles" },
  importProgress: { uk: "{phase}: {pct}% ({done}/{total})", en: "{phase}: {pct}% ({done}/{total})" },
  downloading: { uk: "Завантаження…", en: "Downloading…" },
  processingMap: { uk: "Обробка карти…", en: "Processing map…" },
  downloadImportFailed: { uk: "Не вдалося завантажити й імпортувати карту «{name}»", en: "Failed to download and import map “{name}”" },
  downloadImportOk: { uk: "Карту «{name}» завантажено й імпортовано", en: "Map “{name}” downloaded and imported" },
  errorPrefix: { uk: "Помилка: {msg}", en: "Error: {msg}" },
  importCancelled: { uk: "Імпорт скасовано", en: "Import cancelled" },
  importFailed: { uk: "Не вдалося імпортувати карту", en: "Failed to import map" },
  mapImported: { uk: "Карту імпортовано", en: "Map imported" },
  importErrorPrefix: { uk: "Помилка імпорту: {msg}", en: "Import error: {msg}" },
  mapRemoved: { uk: "Карту прибрано", en: "Map removed" },

  yes: { uk: "Так", en: "Yes" },

  saveToLogBtn: { uk: "Записати в журнал", en: "Save to log" },
  savedToLog: { uk: "Записано в журнал", en: "Saved to log" },
  logEmpty: { uk: "Журнал порожній. Натисніть «Записати в журнал» на вкладці «Розрахунок».", en: "The log is empty. Press “Save to log” on the Solution tab." },
  logAzimuth: { uk: "Азимут", en: "Bearing" },
  logElevation: { uk: "Підвищення, мілі", en: "Elevation, mils" },
  logRange: { uk: "Дальність", en: "Range" },
  logCharge: { uk: "Заряд", en: "Charge" },
  logTof: { uk: "Час польоту", en: "Flight time" },
  logDh: { uk: "Δ висоти", en: "Height diff." },
  logToday: { uk: "Сьогодні", en: "Today" },
  logYesterday: { uk: "Вчора", en: "Yesterday" },
  unitSec: { uk: "с", en: "s" },
  logEntryDeg: { uk: "Азимут {bearing}°, підвищення {elevation} мілів", en: "Bearing {bearing}°, elevation {elevation} mils" },
  logEntryMeta: { uk: "{weapon}, {shell}, заряд {charge} • {range} м", en: "{weapon}, {shell}, charge {charge} • {range} m" },
  clearLogBtn: { uk: "Очистити журнал", en: "Clear log" },
  clearLogTitle: { uk: "Очистити журнал?", en: "Clear the log?" },
  clearLogText: { uk: "Буде видалено записів: {n} на терені {terrain}.", en: "{n} log entries on {terrain} will be deleted." }
};

let current: Lang = "uk";
const listeners: Array<() => void> = [];

/** Усі ключі словника (для тесту, що кожен використаний у коді ключ перекладено). */
export function dictKeys(): string[] {
  return Object.keys(DICT);
}

export function getLang(): Lang {
  return current;
}

export function setLangSilent(l: Lang): void {
  current = l;
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  document.documentElement.lang = l;
  applyStaticTranslations();
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void): void {
  listeners.push(fn);
}

export function t(key: keyof typeof DICT, vars?: Record<string, string | number>): string {
  const entry = DICT[key];
  let s = entry ? entry[current] : String(key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split("{" + k + "}").join(String(v));
  return s;
}

/** Проходить по [data-i18n]/[data-i18n-html]/[data-i18n-placeholder]/[data-i18n-aria-label] і підставляє переклад. */
export function applyStaticTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as keyof typeof DICT);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml as keyof typeof DICT);
  });
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder as keyof typeof DICT);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel as keyof typeof DICT));
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle as keyof typeof DICT);
  });
}
