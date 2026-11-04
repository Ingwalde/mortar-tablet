using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;

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
