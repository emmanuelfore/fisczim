using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    public class ZReport
    {
        public string Date { get; set; }
        public string Time { get; set; }
        public string Address1 { get; set; }
        public string Address2 { get; set; }
        public string Address3 { get; set; }
        public string Address4 { get; set; }

        public string VATNUM { get; set; }
        public string BPNUM { get; set; }
        public string TaxOffice { get; set; }
        public string zNumber { get; set; }
        public string EFDSERIAL { get; set; }
        public string RegDate { get; set; }
        public string User { get; set; }
        public string Currency { get; set; }
        public string Signature { get; set; }

        public List<VatTotal> VatTotals { get; set; }
    }
}
