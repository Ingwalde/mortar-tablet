using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

class SetupForm : Form
{
    enum Page { Setup, Progress, Done, Error }

    readonly int W = Gfx.P(620), H = Gfx.P(470);

    readonly bool preview;
    readonly bool fresh;
    readonly Existing existing;
    readonly bool mapsLocked;
    readonly string version;
    readonly double expectedBytes;
    readonly Bitmap emblem;
    string lang;
    Page page = Page.Setup;
    string errorText = "";
    string installedDir = "";
    int exitCode;

    // сторінка налаштувань
    Label hAppDir, hMapsDir, hMapsHint, hPerUser, hExisting;
    PathField appField, mapsField;
    FlatButton appBrowse, mapsBrowse, install, cancel, closeBtn;
    LangSwitch langSwitch;
    // прогрес
    ProgressStrip strip;
    EmblemSpinner spinner;
    Label progStatus, progPct;
    // готово / помилка
    FlatCheck launch;
    FlatButton finish;
    Label doneText;

    static readonly string[][] T = new string[][] {
        new string[] { "title", "Планшет мінометника", "Mortar Tablet" },
        new string[] { "setup", "Встановлення", "Install" },
        new string[] { "setupUp", "Оновлення", "Update" },
        new string[] { "version", "Версія {0}", "Version {0}" },
        new string[] { "appDir", "Папка програми", "Program folder" },
        new string[] { "mapsDir", "Папка для карт і даних", "Folder for maps and data" },
        new string[] { "mapsHint", "Офлайн-карти, тайли й висоти можуть займати кілька гігабайтів: вкажіть, наприклад, великий диск. Папку можна змінити пізніше в застосунку.", "Offline maps, tiles and heights can take several gigabytes: choose, for example, a large disk. You can change the folder later in the app." },
        new string[] { "mapsLocked", "Дані карт уже є на цьому комп'ютері. Папку змінюють у застосунку (Налаштування, «Карти й дані»): файли переносяться разом із даними.", "Map data already exists on this computer. Change the folder in the app (Settings, Maps and data): the files are moved with the data." },
        new string[] { "perUser", "Установка лише для вашого облікового запису, без прав адміністратора.", "Installs for your account only, without administrator rights." },
        new string[] { "existing", "Програма вже встановлена: буде оновлено на місці.", "The program is already installed: it will be updated in place." },
        new string[] { "existingAll", "Уже встановлено для всіх користувачів: потрібен дозвіл адміністратора.", "Installed for all users: administrator permission is needed." },
        new string[] { "install", "Встановити", "Install" },
        new string[] { "update", "Оновити", "Update" },
        new string[] { "cancel", "Скасувати", "Cancel" },
        new string[] { "browse", "Обрати…", "Browse…" },
        new string[] { "progress", "Встановлення…", "Installing…" },
        new string[] { "progressUp", "Оновлення…", "Updating…" },
        new string[] { "prep", "Підготовка файлів…", "Preparing the files…" },
        new string[] { "copy", "Копіювання файлів…", "Copying the files…" },
        new string[] { "finishing", "Завершення…", "Finishing…" },
        new string[] { "done", "Готово", "Done" },
        new string[] { "doneText", "Планшет мінометника встановлено.", "Mortar Tablet is installed." },
        new string[] { "doneTextUp", "Планшет мінометника оновлено.", "Mortar Tablet is updated." },
        new string[] { "launch", "Запустити Планшет мінометника", "Launch Mortar Tablet" },
        new string[] { "close", "Закрити", "Close" },
        new string[] { "err", "Не вдалося встановити", "Installation failed" },
        new string[] { "errUp", "Не вдалося оновити", "Update failed" },
        new string[] { "errText", "Код помилки {0}. Закрийте Планшет мінометника, якщо він запущений, і спробуйте ще раз.", "Error code {0}. Close Mortar Tablet if it is running and try again." },
        new string[] { "badDir", "Вкажіть повний шлях до папки (наприклад, D:\\Programs).", "Enter a full folder path (for example D:\\Programs)." },
        new string[] { "cancelAsk", "Перервати установку?", "Cancel the installation?" },
        new string[] { "previewNote", "Перегляд вигляду: нічого не встановлюється", "Preview: nothing is installed" }
    };

    /// <summary>Підпис для установки або, якщо програма вже стоїть, для оновлення: base чи base + "Up".</summary>
    string LU(string key)
    {
        return L(existing != null ? key + "Up" : key);
    }

    string L(string key)
    {
        int col = lang == "uk" ? 1 : 2;
        foreach (string[] row in T) if (row[0] == key) return row[col];
        return key;
    }

    public SetupForm(bool preview, string langArg, string pageArg, bool fresh)
    {
        this.preview = preview;
        lang = langArg == "uk" || langArg == "en" ? langArg : (CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "uk" ? "uk" : "en");
        version = Payload.ReadText("version.txt", "1.0.0");
        double.TryParse(Payload.ReadText("expected.txt", "600000000"), NumberStyles.Float, CultureInfo.InvariantCulture, out expectedBytes);
        if (expectedBytes < 1) expectedBytes = 600000000;
        this.fresh = fresh;
        existing = fresh ? null : Existing.Find();
        string appData = Program.AppData();
        mapsLocked = !fresh && (File.Exists(Path.Combine(appData, Program.AppDirName, "board.json")) || File.Exists(Path.Combine(appData, Program.AppDirName, "data-dir.txt")));

        Stream es = Assembly.GetExecutingAssembly().GetManifestResourceStream("emblem.png");
        emblem = es == null ? null : new Bitmap(es);

        Text = L("title") + " " + LU("setup");
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(W, H);
        BackColor = Colors.Bg;
        DoubleBuffered = true;
        Font = new Font("Segoe UI", 10f);
        ShowInTaskbar = true;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        using (GraphicsPath p = Gfx.Round(new Rectangle(0, 0, W, H), Gfx.P(18))) Region = new Region(p);

        BuildControls();
        string start = pageArg;
        if (preview && start == "progress") { Show(Page.Progress); strip.Value = 0.62; }
        else if (preview && start == "done") { Show(Page.Done); }
        else if (preview && start == "error") { exitCode = 2; errorText = string.Format(L("errText"), 2); Show(Page.Error); }
        else Show(Page.Setup);
        if (Program.AutoStart) Shown += delegate { StartInstall(); };
    }

    Label MakeLabel(string text, int x, int y, int w, int h, Color color, Font font)
    {
        Label l = new Label();
        l.AutoSize = false;
        l.Text = text;
        l.SetBounds(x, y, w, h);
        l.ForeColor = color;
        l.BackColor = Colors.Bg;
        l.Font = font;
        Controls.Add(l);
        return l;
    }

    FlatButton MakeButton(int x, int y, int w, bool primary)
    {
        FlatButton b = new FlatButton();
        b.SetBounds(x, y, w, Gfx.P(40));
        b.Primary = primary;
        b.BackColor = Colors.Bg;
        Controls.Add(b);
        return b;
    }

    void BuildControls()
    {
        Font small = new Font("Segoe UI", 9f);
        Font body = new Font("Segoe UI", 10f);
        int m = Gfx.P(40);
        int gap = Gfx.P(12);
        int fh = Gfx.P(40);
        int bw = Gfx.P(104);
        int top = Gfx.P(20);

        closeBtn = new FlatButton();
        closeBtn.CloseGlyph = true;
        closeBtn.SetBounds(W - top - Gfx.P(36), top, Gfx.P(36), Gfx.P(36));
        closeBtn.BackColor = Colors.Bg;
        closeBtn.Click += delegate { AskCancel(); };
        Controls.Add(closeBtn);

        langSwitch = new LangSwitch();
        langSwitch.SetBounds(W - top - Gfx.P(36) - gap - Gfx.P(92), top, Gfx.P(92), Gfx.P(36));
        langSwitch.BackColor = Colors.Bg;
        langSwitch.IsRight = lang == "en";
        langSwitch.Toggled += delegate { lang = langSwitch.IsRight ? "en" : "uk"; ApplyTexts(); };
        Controls.Add(langSwitch);

        // налаштування
        hAppDir = MakeLabel("", m, Gfx.P(150), W - 2 * m, Gfx.P(20), Colors.Muted, small);
        appField = new PathField();
        appField.SetBounds(m, Gfx.P(174), W - 2 * m - bw - gap, fh);
        appField.BackColor = Colors.Bg;
        Controls.Add(appField);
        appBrowse = MakeButton(W - m - bw, Gfx.P(174), bw, false);
        appBrowse.Click += delegate { Browse(appField.Box); };

        hMapsDir = MakeLabel("", m, Gfx.P(232), W - 2 * m, Gfx.P(20), Colors.Muted, small);
        mapsField = new PathField();
        mapsField.SetBounds(m, Gfx.P(256), W - 2 * m - bw - gap, fh);
        mapsField.BackColor = Colors.Bg;
        Controls.Add(mapsField);
        mapsBrowse = MakeButton(W - m - bw, Gfx.P(256), bw, false);
        mapsBrowse.Click += delegate { Browse(mapsField.Box); };
        hMapsHint = MakeLabel("", m, Gfx.P(304), W - 2 * m, Gfx.P(46), Colors.Muted, small);

        hExisting = MakeLabel("", m, Gfx.P(354), W - 2 * m, Gfx.P(36), Colors.Warn, small);
        hPerUser = MakeLabel("", m, Gfx.P(354), W - 2 * m, Gfx.P(36), Colors.Muted, small);

        install = MakeButton(W - m - Gfx.P(170), H - Gfx.P(60), Gfx.P(170), true);
        install.Click += delegate { StartInstall(); };
        cancel = MakeButton(W - m - Gfx.P(170) - gap - Gfx.P(130), H - Gfx.P(60), Gfx.P(130), false);
        cancel.Click += delegate { AskCancel(); };

        // прогрес
        spinner = new EmblemSpinner();
        spinner.SetBounds(W / 2 - Gfx.P(56), Gfx.P(70), Gfx.P(112), Gfx.P(112));
        spinner.BackColor = Colors.Bg;
        Controls.Add(spinner);
        strip = new ProgressStrip();
        strip.SetBounds(m, Gfx.P(270), W - 2 * m, Gfx.P(10));
        strip.BackColor = Colors.Bg;
        Controls.Add(strip);
        progStatus = MakeLabel("", m, Gfx.P(292), W - Gfx.P(160), Gfx.P(22), Colors.Ink, body);
        progPct = MakeLabel("", W - Gfx.P(120), Gfx.P(292), Gfx.P(80), Gfx.P(22), Colors.Muted, body);
        progPct.TextAlign = ContentAlignment.TopRight;

        // готово / помилка
        doneText = MakeLabel("", m, Gfx.P(215), W - 2 * m, Gfx.P(60), Colors.Ink, new Font("Segoe UI", 11f));
        launch = new FlatCheck();
        launch.Checked = true;
        launch.BackColor = Colors.Bg;
        launch.SetBounds(W / 2 - Gfx.P(180), Gfx.P(296), Gfx.P(360), Gfx.P(32));
        Controls.Add(launch);
        finish = MakeButton(W - m - Gfx.P(170), H - Gfx.P(60), Gfx.P(170), true);
        finish.Click += delegate { Finish(); };
    }

    void ApplyTexts()
    {
        Text = L("title") + " " + LU("setup");
        hAppDir.Text = L("appDir");
        hMapsDir.Text = L("mapsDir");
        hMapsHint.Text = mapsLocked ? L("mapsLocked") : L("mapsHint");
        hPerUser.Text = existing != null && existing.AllUsers ? "" : L("perUser");
        hExisting.Text = existing == null ? "" : (existing.AllUsers ? L("existingAll") : L("existing"));
        appBrowse.Text = L("browse");
        mapsBrowse.Text = L("browse");
        install.Text = existing == null ? L("install") : L("update");
        cancel.Text = L("cancel");
        progStatus.Text = progStatus.Tag as string == null ? L("prep") : L((string)progStatus.Tag);
        launch.Text = L("launch");
        finish.Text = L("close");
        if (page == Page.Done) doneText.Text = LU("doneText");
        if (page == Page.Error) doneText.Text = string.Format(L("errText"), exitCode);
        Invalidate();
    }

    void Show(Page p)
    {
        page = p;
        bool setup = p == Page.Setup, prog = p == Page.Progress, done = p == Page.Done, err = p == Page.Error;
        foreach (Control c in new Control[] { hAppDir, appField, appBrowse, hMapsDir, hMapsHint, hExisting, hPerUser, install, cancel })
            c.Visible = setup;
        hExisting.Visible = setup && existing != null;
        hPerUser.Visible = setup && (existing == null || !existing.AllUsers);
        mapsField.Visible = setup && !mapsLocked;
        mapsBrowse.Visible = setup && !mapsLocked;
        hMapsDir.Visible = setup && !mapsLocked;
        if (setup && mapsLocked) hMapsHint.Top = Gfx.P(232); else if (setup) hMapsHint.Top = Gfx.P(304);
        strip.Visible = prog;
        spinner.Visible = prog;
        progStatus.Visible = prog;
        progPct.Visible = prog;
        doneText.Visible = done || err;
        launch.Visible = done;
        finish.Visible = done || err;
        closeBtn.Visible = !prog;
        langSwitch.Visible = setup;
        if (setup)
        {
            if (appField.Box.Text.Length == 0) appField.Box.Text = Program.AppDirArg ?? DefaultAppDir();
            if (mapsField.Box.Text.Length == 0) mapsField.Box.Text = Program.MapsDirArg ?? DefaultMapsDir();
            appField.Box.ReadOnly = existing != null;
            appBrowse.Enabled = existing == null;
            if (existing != null) appField.Box.Text = existing.Location;
        }
        ApplyTexts();
        Invalidate();
    }

    string DefaultAppDir()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", Program.AppDirName);
    }

    string DefaultMapsDir()
    {
        return Path.Combine(Program.AppData(), Program.AppDirName);
    }

    void Browse(TextBox box)
    {
        using (FolderBrowserDialog d = new FolderBrowserDialog())
        {
            d.ShowNewFolderButton = true;
            try { if (Directory.Exists(box.Text)) d.SelectedPath = box.Text; } catch { }
            if (d.ShowDialog(this) == DialogResult.OK) box.Text = d.SelectedPath;
        }
    }

    void AskCancel()
    {
        if (page == Page.Setup || page == Page.Done || page == Page.Error) { Close(); return; }
    }

    // ---------- вигляд ----------

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        Gfx.Smooth(g);
        using (Pen pen = new Pen(Colors.Line))
        using (GraphicsPath p = Gfx.Round(new Rectangle(0, 0, W - 1, H - 1), Gfx.P(18)))
            g.DrawPath(pen, p);

        Font head = new Font("Segoe UI Semibold", 20f);
        Font sub = new Font("Segoe UI", 10f);
        if (page == Page.Setup)
        {
            DrawEmblem(g, new Rectangle(Gfx.P(40), Gfx.P(36), Gfx.P(64), Gfx.P(64)));
            TextRenderer.DrawText(g, L("title"), head, new Point(Gfx.P(118), Gfx.P(38)), Colors.Ink);
            TextRenderer.DrawText(g, LU("setup") + "  ·  " + string.Format(L("version"), version), sub, new Point(Gfx.P(121), Gfx.P(80)), Colors.Muted);
            if (preview) TextRenderer.DrawText(g, L("previewNote"), new Font("Segoe UI", 8.5f), new Point(Gfx.P(121), Gfx.P(104)), Colors.Warn);
        }
        else if (page == Page.Progress)
        {
            TextRenderer.DrawText(g, LU("progress"), head, new Rectangle(0, Gfx.P(196), W, Gfx.P(44)), Colors.Ink, TextFormatFlags.HorizontalCenter);
        }
        else
        {
            bool ok = page == Page.Done;
            DrawEmblem(g, new Rectangle(W / 2 - Gfx.P(40), Gfx.P(50), Gfx.P(80), Gfx.P(80)));
            TextRenderer.DrawText(g, ok ? L("done") : LU("err"), head, new Rectangle(0, Gfx.P(140), W, Gfx.P(44)), ok ? Colors.Accent : Colors.Warn, TextFormatFlags.HorizontalCenter);
            doneText.TextAlign = ContentAlignment.TopCenter;
        }
    }

    void DrawEmblem(Graphics g, Rectangle r)
    {
        if (emblem != null) g.DrawImage(emblem, r);
        else
        {
            using (SolidBrush b = new SolidBrush(Colors.Panel)) g.FillEllipse(b, r);
        }
    }

    // перетягування вікна за верхню частину
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, int w, int l);

    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left && e.Y < Gfx.P(120))
        {
            ReleaseCapture();
            SendMessage(Handle, 0xA1, 2, 0);
        }
        base.OnMouseDown(e);
    }

    // ---------- установка ----------

    string Normalize(string dir)
    {
        string d = (dir ?? "").Trim().Trim('"');
        if (d.Length < 4 || !Path.IsPathRooted(d)) return null;
        try { d = Path.GetFullPath(d); } catch { return null; }
        string root = Path.GetPathRoot(d);
        if (string.Equals(d.TrimEnd('\\'), root.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase) && root.Length <= 3) return d;
        return d;
    }

    void StartInstall()
    {
        string appDir = null, mapsDir = null;
        if (existing == null)
        {
            appDir = Normalize(appField.Box.Text);
            if (appDir == null) { MessageBox.Show(this, L("badDir"), L("title")); return; }
            // програма завжди в підпапці з її назвою: деінсталятор видаляє папку цілком, тож це не має бути корінь диска чи чужа папка
            if (appDir.IndexOf(Program.AppDirName, StringComparison.OrdinalIgnoreCase) < 0) appDir = Path.Combine(appDir, Program.AppDirName);
        }
        if (!mapsLocked)
        {
            mapsDir = Normalize(mapsField.Box.Text);
            if (mapsDir == null) { MessageBox.Show(this, L("badDir"), L("title")); return; }
        }

        Show(Page.Progress);
        strip.Value = 0;
        SetStatus("prep");
        Thread t = new Thread(delegate() { Run(appDir, mapsDir); });
        t.IsBackground = true;
        t.Start();
    }

    void SetStatus(string key)
    {
        progStatus.Tag = key;
        progStatus.Text = L(key);
    }

    void UiSync(Action a)
    {
        if (IsDisposed) return;
        try { BeginInvoke(a); } catch { }
    }

    void Run(string appDir, string mapsDir)
    {
        if (preview)
        {
            for (int i = 0; i <= 100; i++)
            {
                int v = i;
                UiSync(delegate { strip.Value = v / 100.0; progPct.Text = v + "%"; if (v > 12) SetStatus("copy"); });
                Thread.Sleep(60);
            }
            UiSync(delegate { Show(Page.Done); });
            return;
        }

        string payload = null;
        try
        {
            payload = Payload.Extract(delegate(double f) { UiSync(delegate { SetProgress(f * 0.12); }); });
            UiSync(delegate { SetStatus("copy"); });

            string args = "/S";
            string watch;
            if (existing != null)
            {
                args += existing.AllUsers ? " /allusers" : " /currentuser";
                watch = existing.Location;
            }
            else
            {
                // /D=... має бути останнім параметром і без лапок
                args += " /currentuser /D=" + appDir;
                watch = appDir;
            }

            ProcessStartInfo psi = new ProcessStartInfo(payload, args);
            psi.UseShellExecute = false;
            Process p = Process.Start(psi);
            // Оновлення на місці: NSIS спершу видаляє стару версію (розмір папки падає), потім копіює нову. Тому відлік іде від найменшого
            // розміру, який побачили, а смужка ніколи не відкочується назад і не доходить до кінця, поки інсталятор не завершився.
            long smallest = DirSize(watch);
            double best = 0.12;
            while (!p.WaitForExit(350))
            {
                long cur = DirSize(watch);
                if (cur < smallest) smallest = cur;
                double f = Math.Min(1.0, (cur - smallest) / Math.Max(1.0, expectedBytes - smallest));
                double v = Math.Min(0.97, 0.12 + f * 0.85);
                if (v > best) best = v;
                double shown = best;
                Trace(shown, cur);
                UiSync(delegate { SetProgress(shown); });
            }
            exitCode = p.ExitCode;
            if (exitCode != 0)
            {
                errorText = string.Format(L("errText"), exitCode);
                UiSync(delegate { Show(Page.Error); });
                return;
            }

            UiSync(delegate { SetStatus("finishing"); SetProgress(0.99); });
            installedDir = existing != null ? existing.Location : appDir;
            Existing now = fresh ? null : Existing.Find();
            if (now != null) installedDir = now.Location;
            if (!mapsLocked && mapsDir != null) SaveMapsDir(mapsDir);
            UiSync(delegate { SetProgress(1); });
            Thread.Sleep(500);
            UiSync(delegate { Show(Page.Done); });
        }
        catch (Exception ex)
        {
            exitCode = -1;
            UiSync(delegate { errorText = ex.Message; Show(Page.Error); });
        }
        finally
        {
            if (payload != null) Payload.Cleanup(payload);
        }
    }

    /// <summary>Для перевірок: якщо задано MORTAR_SETUP_TRACE, у цей файл дописуються відсоток і розмір папки.</summary>
    static void Trace(double v, long size)
    {
        string f = Environment.GetEnvironmentVariable("MORTAR_SETUP_TRACE");
        if (string.IsNullOrEmpty(f)) return;
        try { File.AppendAllText(f, string.Format(CultureInfo.InvariantCulture, "{0:F3} {1}\r\n", v, size)); } catch { }
    }

    void SetProgress(double v)
    {
        if (v < strip.Value) return;
        strip.Value = v;
        progPct.Text = (int)Math.Round(v * 100) + "%";
    }

    static long DirSize(string dir)
    {
        long total = 0;
        try
        {
            if (!Directory.Exists(dir)) return 0;
            foreach (string f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories))
            {
                try { total += new FileInfo(f).Length; } catch { }
            }
        }
        catch { }
        return total;
    }

    /// <summary>Запам'ятовує папку для карт у data-dir.txt (UTF-16 з BOM, як читає застосунок), якщо вона не типова.</summary>
    void SaveMapsDir(string mapsDir)
    {
        string def = DefaultMapsDir();
        if (string.Equals(mapsDir.TrimEnd('\\'), def.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) return;
        try
        {
            Directory.CreateDirectory(mapsDir);
            Directory.CreateDirectory(def);
            File.WriteAllText(Path.Combine(def, "data-dir.txt"), mapsDir + "\r\n", new UnicodeEncoding(false, true));
        }
        catch { }
    }

    void Finish()
    {
        if (page == Page.Done && launch.Checked && !preview)
        {
            try
            {
                string exe = Path.Combine(installedDir, Program.ExeName);
                if (File.Exists(exe)) Process.Start(new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = installedDir });
            }
            catch { }
        }
        Close();
    }
}
