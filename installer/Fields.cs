using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

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
