// Власне вікно установки «Планшета мінометника» (Windows): темний інтерфейс, мова, дві папки, прогрес.
// Усередині лежить звичайний NSIS-інсталятор (ресурс payload.exe): вікно розпаковує його у тимчасову папку й запускає тихо (/S),
// тож установка, оновлення, права й автооновлення електрон-апдейтера лишаються тими самими. З параметром /S вікна нема:
// усі параметри передаються NSIS-інсталятору як є (так його запускає автооновлення).
//
// Збирається класичним компілятором .NET Framework (csc, мова C# 5): scripts/build-setup-ui.mjs. Параметри для перевірки вигляду:
//   /preview            нічого не встановлює, лише показує сторінки (для знімків екрана)
//   /page=setup|progress|done|error   початкова сторінка в режимі /preview
//   /fresh              ігнорувати наявну установку й дані карт (вигляд чистої установки; для перевірок на машині з уже встановленою програмою)
//   змінна середовища MORTAR_SETUP_APPDATA замінює папку AppData користувача (лише для перевірок: щоб не чіпати справжні дані)
//   /lang=uk|en         мова інтерфейсу
//   /autostart /appdir=<папка> /mapsdir=<папка>   для автоматичної перевірки: підставити папки й одразу почати установку
using System;
using System.Windows.Forms;

static class Program
{
    internal const string AppGuid = "f6ac775e-8b2d-5ff6-bbb5-89c627429c71";
    internal const string AppDirName = "mortar-tablet";
    internal const string ExeName = "Планшет мінометника.exe";

    /// <summary>Папка AppData користувача (де лежать дані застосунку); для перевірок її можна замінити змінною середовища.</summary>
    internal static string AppData()
    {
        string o = Environment.GetEnvironmentVariable("MORTAR_SETUP_APPDATA");
        return string.IsNullOrEmpty(o) ? Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData) : o;
    }

    internal static string AppDirArg, MapsDirArg;
    internal static bool AutoStart;

    [STAThread]
    static int Main(string[] args)
    {
        if (Has(args, "/S")) return Payload.RunSilent(RawArgs());
        AppDirArg = Value(args, "/appdir=");
        MapsDirArg = Value(args, "/mapsdir=");
        AutoStart = Has(args, "/autostart");
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SetupForm(Has(args, "/preview"), Value(args, "/lang="), Value(args, "/page="), Has(args, "/fresh")));
        return 0;
    }

    static bool Has(string[] args, string flag)
    {
        foreach (string a in args) if (string.Equals(a, flag, StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    static string Value(string[] args, string prefix)
    {
        foreach (string a in args) if (a.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return a.Substring(prefix.Length);
        return null;
    }

    /// <summary>Параметри командного рядка без імені програми, дослівно (NSIS чекає /D=... останнім і без лапок).</summary>
    static string RawArgs()
    {
        string cl = Environment.CommandLine;
        int i = 0;
        if (cl.Length > 0 && cl[0] == '"')
        {
            i = cl.IndexOf('"', 1);
            i = i < 0 ? cl.Length : i + 1;
        }
        else
        {
            while (i < cl.Length && cl[i] != ' ') i++;
        }
        return cl.Substring(i).Trim();
    }
}
