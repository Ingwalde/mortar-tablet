using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

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
