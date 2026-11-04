using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

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
