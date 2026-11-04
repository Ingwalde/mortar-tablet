using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

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
