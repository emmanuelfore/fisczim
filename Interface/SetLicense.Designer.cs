namespace Revmax_Interface_Promun
{
    partial class SetLicense
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.txtLicense = new System.Windows.Forms.TextBox();
            this.btnSetLicense = new System.Windows.Forms.Button();
            this.SuspendLayout();
            // 
            // txtLicense
            // 
            this.txtLicense.Location = new System.Drawing.Point(34, 60);
            this.txtLicense.Name = "txtLicense";
            this.txtLicense.Size = new System.Drawing.Size(285, 22);
            this.txtLicense.TabIndex = 0;
            this.txtLicense.TextChanged += new System.EventHandler(this.txtLicense_TextChanged);
            // 
            // btnSetLicense
            // 
            this.btnSetLicense.Location = new System.Drawing.Point(114, 110);
            this.btnSetLicense.Name = "btnSetLicense";
            this.btnSetLicense.Size = new System.Drawing.Size(125, 23);
            this.btnSetLicense.TabIndex = 1;
            this.btnSetLicense.Text = "Set License";
            this.btnSetLicense.UseVisualStyleBackColor = true;
            this.btnSetLicense.Click += new System.EventHandler(this.btnSetLicense_Click);
            // 
            // SetLicense
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(8F, 16F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(354, 160);
            this.Controls.Add(this.btnSetLicense);
            this.Controls.Add(this.txtLicense);
            this.Name = "SetLicense";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "SetLicense";
            this.Load += new System.EventHandler(this.SetLicense_Load);
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion
        private System.Windows.Forms.Button btnSetLicense;
        public System.Windows.Forms.TextBox txtLicense;
    }
}