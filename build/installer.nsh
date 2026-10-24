; Додатки до інсталятора Windows (electron-builder, assisted): без питання «для всіх користувачів» і сторінка вибору папки
; для завантажених карт. Мова інсталятора вибирається в першому вікні (electron-builder.yml: displayLanguageSelector).

!include nsDialogs.nsh
!include LogicLib.nsh

; змінні потрібні лише інсталятору: в окремій збірці деінсталятора NSIS вважає невикористану змінну помилкою
!ifndef BUILD_UNINSTALLER
  Var MapsDirInput
  Var MapsDirPath
!endif

; Завжди «лише для мене» (без прав адміністратора): сторінку вибору режиму установки пропускаємо.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Сторінка після вибору папки програми: де зберігати завантажені карти, тайли й висоти.
!macro customPageAfterChangeDir
  Function MapsPageCreate
    ; тиха установка (автооновлення) без сторінок; повторна установка поверх наявної теж нічого не питає
    ${If} ${Silent}
      Abort
    ${EndIf}
    IfFileExists "$APPDATA\mortar-tablet\data-dir.txt" 0 +2
      Abort
    IfFileExists "$APPDATA\mortar-tablet\board.json" 0 +2
      Abort

    ${If} $LANGUAGE == 1058
      !insertmacro MUI_HEADER_TEXT "Папка для карт" "Де зберігати завантажені карти й дані"
      StrCpy $0 "Завантажені офлайн-карти, тайли й висоти можуть займати кілька гігабайтів. Виберіть папку, наприклад, на великому диску. Пізніше її можна змінити в застосунку: Налаштування, розділ «Карти й дані»."
    ${Else}
      !insertmacro MUI_HEADER_TEXT "Maps folder" "Where to keep downloaded maps and data"
      StrCpy $0 "Downloaded offline maps, tiles and heights can take several gigabytes. Choose a folder, for example on a large disk. You can change it later in the app: Settings, Maps and data."
    ${EndIf}

    nsDialogs::Create 1018
    Pop $1
    ${If} $1 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 40u "$0"
    Pop $1
    StrCpy $MapsDirPath "$APPDATA\mortar-tablet"
    ${NSD_CreateText} 0 48u 76% 13u "$MapsDirPath"
    Pop $MapsDirInput
    ${NSD_CreateBrowseButton} 78% 47u 22% 15u "..."
    Pop $1
    ${NSD_OnClick} $1 MapsPageBrowse
    nsDialogs::Show
  FunctionEnd

  Function MapsPageBrowse
    ${NSD_GetText} $MapsDirInput $0
    ${If} $LANGUAGE == 1058
      nsDialogs::SelectFolderDialog "Папка для карт" "$0"
    ${Else}
      nsDialogs::SelectFolderDialog "Maps folder" "$0"
    ${EndIf}
    Pop $0
    ${If} $0 != error
      ${NSD_SetText} $MapsDirInput "$0"
    ${EndIf}
  FunctionEnd

  Function MapsPageLeave
    ${NSD_GetText} $MapsDirInput $MapsDirPath
  FunctionEnd

  Page custom MapsPageCreate MapsPageLeave
!macroend

; Після копіювання файлів: якщо вибрано не типову папку, запам'ятовуємо її (застосунок читає data-dir.txt при запуску).
!macro customInstall
  ${If} $MapsDirPath != ""
  ${AndIf} $MapsDirPath != "$APPDATA\mortar-tablet"
    CreateDirectory "$MapsDirPath"
    CreateDirectory "$APPDATA\mortar-tablet"
    FileOpen $0 "$APPDATA\mortar-tablet\data-dir.txt" w
    FileWriteUTF16LE /BOM $0 "$MapsDirPath$\r$\n"
    FileClose $0
  ${EndIf}
!macroend
