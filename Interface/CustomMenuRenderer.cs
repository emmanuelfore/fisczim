using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace Revmax_Interface_Promun
{
    public class CustomColorTable : ProfessionalColorTable
    {
        // Menu background
        public override Color ToolStripDropDownBackground { get { return Color.White; } }
        public override Color ImageMarginGradientBegin { get { return Color.White; } }
        public override Color ImageMarginGradientMiddle { get { return Color.White; } }
        public override Color ImageMarginGradientEnd { get { return Color.White; } }

        // Hover colors
        public override Color MenuItemSelected { get { return Color.FromArgb(240, 243, 255); } }
        public override Color MenuItemSelectedGradientBegin { get { return Color.FromArgb(240, 243, 255); } }
        public override Color MenuItemSelectedGradientEnd { get { return Color.FromArgb(240, 243, 255); } }
        
        // Borders
        public override Color MenuBorder { get { return Color.FromArgb(200, 210, 230); } }
        public override Color MenuItemBorder { get { return Color.FromArgb(240, 243, 255); } }
        
        // Separators
        public override Color SeparatorDark { get { return Color.FromArgb(230, 235, 245); } }
        public override Color SeparatorLight { get { return Color.White; } }
    }

    public class CustomMenuRenderer : ToolStripProfessionalRenderer
    {
        public CustomMenuRenderer() : base(new CustomColorTable()) { }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            if (e.Item.Selected && e.Item.Enabled)
            {
                // Soft blue highlight with rounded rect
                Rectangle rect = new Rectangle(2, 1, e.Item.Width - 4, e.Item.Height - 2);
                using (GraphicsPath path = GetRoundedRect(rect, 4))
                using (SolidBrush b = new SolidBrush(Color.FromArgb(240, 243, 255)))
                {
                    e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                    e.Graphics.FillPath(b, path);
                }
            }
            else
            {
                base.OnRenderMenuItemBackground(e);
            }
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            e.TextColor = Color.FromArgb(50, 50, 60);
            e.TextFont = new Font("Segoe UI", 9.5F);
            
            // If it's a critical item (like Exit or a sub-menu label), maybe style it differently
            if (e.Item.Text.Contains("Settings") || e.Item.Text.Contains("Operations"))
            {
                e.TextFont = new Font("Segoe UI", 9.5F, FontStyle.Bold);
                e.TextColor = Color.FromArgb(51, 85, 255);
            }

            base.OnRenderItemText(e);
        }

        private GraphicsPath GetRoundedRect(Rectangle bounds, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            if (radius == 0)
            {
                path.AddRectangle(bounds);
                return path;
            }

            int diameter = radius * 2;
            Size size = new Size(diameter, diameter);
            Rectangle arc = new Rectangle(bounds.Location, size);

            path.AddArc(arc, 180, 90);
            arc.X = bounds.Right - diameter;
            path.AddArc(arc, 270, 90);
            arc.Y = bounds.Bottom - diameter;
            path.AddArc(arc, 0, 90);
            arc.X = bounds.Left;
            path.AddArc(arc, 90, 90);
            path.CloseFigure();
            
            return path;
        }
    }
}
