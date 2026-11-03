using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using Microsoft.Win32;

/// <summary>Вбудований NSIS-інсталятор: розпаковка й запуск.</summary>
static class Payload
{
    static Stream Open()
    {
        return Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.exe");
    }

    internal static string ReadText(string name, string fallback)
    {
        Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
        if (s == null) return fallback;
        using (StreamReader r = new StreamReader(s, Encoding.UTF8)) return r.ReadToEnd().Trim();
    }

    /// <summary>Розпаковує інсталятор у нову тимчасову папку, повертає шлях до файлу.</summary>
    internal static string Extract(Action<double> progress)
    {
        string dir = Path.Combine(Path.GetTempPath(), "mortar-tablet-setup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        string file = Path.Combine(dir, "setup.exe");
        using (Stream src = Open())
        using (FileStream dst = File.Create(file))
        {
            byte[] buf = new byte[1 << 20];
            long total = src.Length, done = 0;
            int n;
            while ((n = src.Read(buf, 0, buf.Length)) > 0)
            {
                dst.Write(buf, 0, n);
                done += n;
                if (progress != null) progress(total > 0 ? (double)done / total : 1);
            }
        }
        return file;
    }

    internal static void Cleanup(string file)
    {
        try { Directory.Delete(Path.GetDirectoryName(file), true); } catch { }
    }

    /// <summary>Тихий режим (автооновлення): без вікна, параметри передаються інсталятору як є; повертає його код завершення.</summary>
    internal static int RunSilent(string rawArgs)
    {
        string file = Extract(null);
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(file, rawArgs);
            psi.UseShellExecute = false;
            using (Process p = Process.Start(psi))
            {
                p.WaitForExit();
                return p.ExitCode;
            }
        }
        finally { Cleanup(file); }
    }
}

/// <summary>Що вже встановлено на цьому комп'ютері (за реєстром NSIS-інсталятора).</summary>
class Existing
{
    public string Location;
    public bool AllUsers;

    public static Existing Find()
    {
        string key = "Software\\" + Program.AppGuid;
        foreach (RegistryHive hive in new RegistryHive[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
        {
            try
            {
                using (RegistryKey root = RegistryKey.OpenBaseKey(hive, RegistryView.Registry64))
                using (RegistryKey k = root.OpenSubKey(key))
                {
                    string loc = k == null ? null : k.GetValue("InstallLocation") as string;
                    if (!string.IsNullOrEmpty(loc))
                    {
                        Existing e = new Existing();
                        e.Location = loc;
                        e.AllUsers = hive == RegistryHive.LocalMachine;
                        return e;
                    }
                }
            }
            catch { }
        }
        return null;
    }
}
