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
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

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

class Colors
{
    public static readonly Color Bg = ColorTranslator.FromHtml("#161c18");
    public static readonly Color Panel = ColorTranslator.FromHtml("#1f2721");
    public static readonly Color Field = ColorTranslator.FromHtml("#222b25");
    public static readonly Color Line = ColorTranslator.FromHtml("#34413a");
    public static readonly Color Ink = ColorTranslator.FromHtml("#e6ede8");
    public static readonly Color Muted = ColorTranslator.FromHtml("#98a399");
    public static readonly Color Accent = ColorTranslator.FromHtml("#6ee7a8");
    public static readonly Color OnAccent = ColorTranslator.FromHtml("#0d1a10");
    public static readonly Color Warn = ColorTranslator.FromHtml("#f0c060");
}

static class Gfx
{
    public static GraphicsPath Round(Rectangle r, int radius)
    {
        GraphicsPath p = new GraphicsPath();
        int d = radius * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    /// <summary>Коефіцієнт масштабу екрана (1 на 96 DPI): усі розміри в пікселях множимо на нього, а шрифти (в пунктах) масштабує система.</summary>
    public static readonly float K = DpiScale();

    static float DpiScale()
    {
        try
        {
            using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) return g.DpiX / 96f;
        }
        catch { return 1f; }
    }

    public static int P(int v)
    {
        return (int)Math.Round(v * K);
    }

    public static void Smooth(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
    }
}

/// <summary>Кнопка з заокругленими кутами; головна — акцентного кольору.</summary>
class FlatButton : Control
{
    public bool Primary;
    /// <summary>Замість підпису малюється хрестик закриття (по центру, без залежності від шрифту).</summary>
    public bool CloseGlyph;
    bool hover, down;

    public FlatButton()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
        Cursor = Cursors.Hand;
        Font = new Font("Segoe UI Semibold", 10.5f);
        Height = Gfx.P(40);
    }

    protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hover = false; down = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
    protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.Space) OnClick(EventArgs.Empty);
        base.OnKeyDown(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        Gfx.Smooth(g);
        g.Clear(Parent == null ? Colors.Bg : Parent.BackColor);
        Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
        Color fill, ink, border;
        if (Primary)
        {
            fill = !Enabled ? Colors.Line : down ? ControlPaint.Dark(Colors.Accent, 0.1f) : hover ? ControlPaint.Light(Colors.Accent, 0.15f) : Colors.Accent;
            ink = Colors.OnAccent;
            border = fill;
        }
        else
        {
            fill = down ? Colors.Line : hover ? Colors.Panel : Colors.Bg;
            ink = Enabled ? Colors.Ink : Colors.Muted;
            border = Colors.Line;
        }
        using (GraphicsPath p = Gfx.Round(r, Gfx.P(12)))
        using (SolidBrush b = new SolidBrush(fill))
        using (Pen pen = new Pen(border))
        {
            g.FillPath(b, p);
            g.DrawPath(pen, p);
        }
        if (CloseGlyph)
        {
            float c = Gfx.P(6);
            float cx = Width / 2f, cy = Height / 2f;
            using (Pen x = new Pen(ink, Gfx.K * 1.8f))
            {
                x.StartCap = LineCap.Round;
                x.EndCap = LineCap.Round;
                g.DrawLine(x, cx - c, cy - c, cx + c, cy + c);
                g.DrawLine(x, cx - c, cy + c, cx + c, cy - c);
            }
        }
        else TextRenderer.DrawText(g, Text, Font, new Rectangle(0, 0, Width, Height), ink, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
    }
}

/// <summary>Власний прапорець: заокруглений квадрат акцентного кольору з галочкою, підпис праворуч.</summary>
class FlatCheck : Control
{
    bool isChecked, hover;

    public FlatCheck()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
        Cursor = Cursors.Hand;
        Font = new Font("Segoe UI", 10.5f);
        Height = Gfx.P(30);
    }

    public bool Checked
    {
        get { return isChecked; }
        set { isChecked = value; Invalidate(); }
    }

    protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnClick(EventArgs e) { isChecked = !isChecked; Invalidate(); base.OnClick(e); }
    protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
    protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter) OnClick(EventArgs.Empty);
        base.OnKeyDown(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        Gfx.Smooth(g);
        g.Clear(Parent == null ? Colors.Bg : Parent.BackColor);
        int size = Gfx.P(22);
        float k = Gfx.K;
        Rectangle box = new Rectangle(1, (Height - size) / 2, size, size);
        using (GraphicsPath p = Gfx.Round(box, Gfx.P(7)))
        {
            if (isChecked)
            {
                using (SolidBrush b = new SolidBrush(hover ? ControlPaint.Light(Colors.Accent, 0.15f) : Colors.Accent)) g.FillPath(b, p);
                using (Pen tick = new Pen(Colors.OnAccent, 2.6f * k))
                {
                    tick.StartCap = LineCap.Round;
                    tick.EndCap = LineCap.Round;
                    tick.LineJoin = LineJoin.Round;
                    g.DrawLines(tick, new PointF[] { new PointF(box.X + 5.5f * k, box.Y + 11.5f * k), new PointF(box.X + 9.5f * k, box.Y + 15.5f * k), new PointF(box.X + 16.5f * k, box.Y + 7f * k) });
                }
            }
            else
            {
                using (SolidBrush b = new SolidBrush(Colors.Field)) g.FillPath(b, p);
                using (Pen pen = new Pen(hover ? Colors.Accent : Colors.Line, 1.5f * k)) g.DrawPath(pen, p);
            }
            if (Focused)
            {
                int o = Gfx.P(3);
                Rectangle ring = new Rectangle(box.X - o, box.Y - o, box.Width + 2 * o, box.Height + 2 * o);
                using (GraphicsPath rp = Gfx.Round(ring, Gfx.P(9)))
                using (Pen fp = new Pen(Color.FromArgb(120, Colors.Accent), 1.5f * k)) g.DrawPath(fp, rp);
            }
        }
        TextRenderer.DrawText(g, Text, Font, new Rectangle(size + Gfx.P(12), 0, Width - size - Gfx.P(12), Height), Colors.Ink, TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.Left);
    }
}

/// <summary>Смужка прогресу з плавним доганянням цілі.</summary>
class ProgressStrip : Control
{
    double shown, target;
    System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();

    public ProgressStrip()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        Height = Gfx.P(10);
        timer.Interval = 16;
        timer.Tick += delegate
        {
            double d = target - shown;
            if (Math.Abs(d) < 0.0008) { shown = target; }
            else shown += d * 0.12;
            Invalidate();
        };
        timer.Start();
    }

    public double Value
    {
        get { return target; }
        set { target = Math.Max(0, Math.Min(1, value)); }
    }

    public double Shown { get { return shown; } }

    protected override void Dispose(bool disposing)
    {
        if (disposing) timer.Dispose();
        base.Dispose(disposing);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        Gfx.Smooth(g);
        g.Clear(Parent == null ? Colors.Bg : Parent.BackColor);
        Rectangle track = new Rectangle(0, 0, Width - 1, Height - 1);
        using (GraphicsPath p = Gfx.Round(track, Height / 2))
        using (SolidBrush b = new SolidBrush(Colors.Field))
            g.FillPath(b, p);
        int w = (int)Math.Round((Width - 1) * shown);
        if (w >= Height)
        {
            Rectangle bar = new Rectangle(0, 0, w, Height - 1);
            using (GraphicsPath p = Gfx.Round(bar, Height / 2))
            using (SolidBrush b = new SolidBrush(Colors.Accent))
                g.FillPath(b, p);
        }
    }
}

/// <summary>Поле введення в заокругленій рамці.</summary>
class PathField : Control
{
    public TextBox Box = new TextBox();

    public PathField()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        Height = Gfx.P(40);
        Box.BorderStyle = BorderStyle.None;
        Box.BackColor = Colors.Field;
        Box.ForeColor = Colors.Ink;
        Box.Font = new Font("Segoe UI", 9.5f);
        Controls.Add(Box);
    }

    protected override void OnLayout(LayoutEventArgs e)
    {
        Box.SetBounds(Gfx.P(12), (Height - Box.Height) / 2, Width - Gfx.P(24), Box.Height);
        base.OnLayout(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        Gfx.Smooth(g);
        g.Clear(Parent == null ? Colors.Bg : Parent.BackColor);
        Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
        using (GraphicsPath p = Gfx.Round(r, Gfx.P(10)))
        using (SolidBrush b = new SolidBrush(Colors.Field))
        using (Pen pen = new Pen(Box.Focused ? Colors.Accent : Colors.Line))
        {
            g.FillPath(b, p);
            g.DrawPath(pen, p);
        }
    }
}

/// <summary>Анімована емблема на сторінці прогресу (як заставка застосунку): кільце малюється, тіки виростають, точка вискакує, потім усе згасає й повторюється.</summary>
class EmblemSpinner : Control
{
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    readonly Stopwatch clock = Stopwatch.StartNew();
    static readonly Color Orange = ColorTranslator.FromHtml("#f0a05a");

    public EmblemSpinner()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        timer.Interval = 16;
        timer.Tick += delegate { Invalidate(); };
        VisibleChanged += delegate { if (Visible) timer.Start(); else timer.Stop(); };
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) timer.Dispose();
        base.Dispose(disposing);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        Gfx.Smooth(g);
        g.Clear(Parent == null ? Colors.Bg : Parent.BackColor);
        const double cycle = 3.0;
        double p = (clock.Elapsed.TotalSeconds % cycle) / cycle;
        float s = Math.Min(Width, Height) / 64f;
        float cx = Width / 2f, cy = Height / 2f;
        float r = 14f * s;
        float stroke = 2.6f * s;
        RectangleF ring = new RectangleF(cx - r, cy - r, 2 * r, 2 * r);

        // кільце малюється по колу
        double rp = Clamp01(p / 0.30);
        float sweep = (float)(360.0 * EaseOut(rp));
        if (sweep > 0.5f)
        {
            using (Pen pen = new Pen(Colors.Accent, stroke))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                g.DrawArc(pen, ring, -90f, sweep >= 359.5f ? 359.5f : sweep);
            }
        }

        // тіки виростають із прозорості й трохи зсуву назовні
        double tp = Clamp01((p - 0.25) / 0.20);
        if (tp > 0)
        {
            float off = (float)((1 - tp) * 4.0) * s;
            using (Pen tick = new Pen(Color.FromArgb((int)(255 * tp), Colors.Accent), stroke))
            {
                tick.StartCap = LineCap.Round;
                tick.EndCap = LineCap.Round;
                float inner = 18f * s + off, outer = 23f * s + off;
                g.DrawLine(tick, cx, cy - outer, cx, cy - inner);
                g.DrawLine(tick, cx, cy + inner, cx, cy + outer);
                g.DrawLine(tick, cx - outer, cy, cx - inner, cy);
                g.DrawLine(tick, cx + inner, cy, cx + outer, cy);
            }
        }

        // точка вискакує з перельотом
        double dp = Clamp01((p - 0.40) / 0.20);
        if (dp > 0)
        {
            float d = (float)(3.6 * Back(dp)) * s;
            using (SolidBrush dot = new SolidBrush(Orange))
                g.FillEllipse(dot, cx - d, cy - d, 2 * d, 2 * d);
        }

        // наприкінці циклу все плавно згасає, і анімація починається знову
        if (p > 0.88)
        {
            int a = (int)(255 * Clamp01((p - 0.88) / 0.12));
            using (SolidBrush veil = new SolidBrush(Color.FromArgb(a, Parent == null ? Colors.Bg : Parent.BackColor)))
                g.FillRectangle(veil, 0, 0, Width, Height);
        }
    }

    static double Clamp01(double v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    static double EaseOut(double x) { return 1 - Math.Pow(1 - x, 3); }
    static double Back(double x)
    {
        const double c = 1.70158;
        return 1 + (c + 1) * Math.Pow(x - 1, 3) + c * Math.Pow(x - 1, 2);
    }
}

/// <summary>Перемикач мови «UA | EN»: рухомий акцентний бігунок із плавною анімацією.</summary>
class LangSwitch : Control
{
    bool right;
    double pos;
    System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    public event EventHandler Toggled;

    public LangSwitch()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        Cursor = Cursors.Hand;
        Font = new Font("Segoe UI Semibold", 9.5f);
        Height = Gfx.P(36);
        Width = Gfx.P(92);
        timer.Interval = 15;
        timer.Tick += delegate
        {
            double target = right ? 1 : 0;
            double d = target - pos;
            if (Math.Abs(d) < 0.004) { pos = target; timer.Stop(); }
            else pos += d * 0.28;
            Invalidate();
        };
    }

    public bool IsRight
    {
        get { return right; }
        set { right = value; pos = value ? 1 : 0; Invalidate(); }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) timer.Dispose();
        base.Dispose(disposing);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        bool wantRight = e.X >= Width / 2;
        if (wantRight == right) return;
        right = wantRight;
        timer.Start();
        if (Toggled != null) Toggled(this, EventArgs.Empty);
        base.OnMouseDown(e);
    }

    static Color Mix(Color a, Color b, double t)
    {
        return Color.FromArgb((int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        Gfx.Smooth(g);
        g.Clear(Parent == null ? Colors.Bg : Parent.BackColor);
        Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
        using (GraphicsPath p = Gfx.Round(r, Height / 2))
        using (SolidBrush b = new SolidBrush(Colors.Field))
        using (Pen pen = new Pen(Colors.Line))
        {
            g.FillPath(b, p);
            g.DrawPath(pen, p);
        }
        int inset = Gfx.P(3);
        int half = (Width - 2 * inset) / 2;
        Rectangle knob = new Rectangle(inset + (int)Math.Round(half * pos), inset, half, Height - 1 - 2 * inset);
        using (GraphicsPath kp = Gfx.Round(knob, knob.Height / 2))
        using (SolidBrush kb = new SolidBrush(Colors.Accent))
            g.FillPath(kb, kp);
        Rectangle left = new Rectangle(inset, 0, half, Height);
        Rectangle rightHalf = new Rectangle(inset + half, 0, half, Height);
        TextFormatFlags f = TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine;
        TextRenderer.DrawText(g, "UA", Font, left, Mix(Colors.OnAccent, Colors.Muted, pos), f);
        TextRenderer.DrawText(g, "EN", Font, rightHalf, Mix(Colors.Muted, Colors.OnAccent, pos), f);
    }
}

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
